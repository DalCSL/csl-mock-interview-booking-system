import pool from '../db/pool.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Admin creates an invite link for a new interviewer
export const createInvite = async (req, res) => {
  const { email } = req.body;

  // TODO: Add admin authentication later
  // For now, this endpoint is unprotected (only you know about it)

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!email.toLowerCase().endsWith('@dal.ca')) {
    return res.status(400).json({ error: 'Must use a @dal.ca email address' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Check if interviewer already exists
    const existing = await pool.query(
      'SELECT id FROM interviewers WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Interviewer already registered' });
    }

    // Check if there's already a pending invite
    const existingInvite = await pool.query(
      `SELECT id FROM interviewer_invites 
       WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [normalizedEmail]
    );

    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ error: 'Invite already sent to this email' });
    }

    // Create invite
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      `INSERT INTO interviewer_invites (email, token, expires_at)
       VALUES ($1, $2, $3)`,
      [normalizedEmail, token, expiresAt]
    );

    // In production, you'd email this link
    const inviteLink = `${process.env.FRONTEND_URL}/register?token=${token}`;

    res.status(201).json({ 
      message: 'Invite created',
      inviteLink,
      expiresAt
    });

  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
};

// Interviewer registers using invite link
export const register = async (req, res) => {
  const { token, name, password, specialties } = req.body;

  if (!token || !name || !password || !specialties) {
    return res.status(400).json({ 
      error: 'Token, name, password, and specialties are required' 
    });
  }

  if (!Array.isArray(specialties) || specialties.length === 0) {
    return res.status(400).json({ error: 'At least one specialty is required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find valid invite
    const inviteResult = await client.query(
      `SELECT id, email FROM interviewer_invites
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired invite' });
    }

    const invite = inviteResult.rows[0];

    // Verify specialties exist
    const validSpecialties = await client.query(
      `SELECT id, name FROM interview_types WHERE name = ANY($1)`,
      [specialties]
    );

    if (validSpecialties.rows.length !== specialties.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid specialty provided' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create interviewer
    const interviewerResult = await client.query(
      `INSERT INTO interviewers (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [invite.email, passwordHash, name]
    );

    const interviewerId = interviewerResult.rows[0].id;

    // Add specialties
    for (const specialty of validSpecialties.rows) {
      await client.query(
        `INSERT INTO interviewer_specialties (interviewer_id, interview_type_id)
         VALUES ($1, $2)`,
        [interviewerId, specialty.id]
      );
    }

    // Mark invite as used
    await client.query(
      `UPDATE interviewer_invites SET used_at = NOW() WHERE id = $1`,
      [invite.id]
    );

    await client.query('COMMIT');

    // Generate JWT
    const jwtToken = jwt.sign(
      { id: interviewerId, email: invite.email, type: 'interviewer' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registration successful',
      token: jwtToken
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  } finally {
    client.release();
  }
};

// Interviewer logs in
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Find interviewer
    const result = await pool.query(
      'SELECT id, email, password_hash, name FROM interviewers WHERE email = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const interviewer = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, interviewer.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: interviewer.id, email: interviewer.email, type: 'interviewer' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

// Get current interviewer profile
export const getMe = async (req, res) => {
  const { id } = req.interviewer;

  try {
    // Get interviewer details
    const interviewerResult = await pool.query(
      'SELECT id, email, name, created_at FROM interviewers WHERE id = $1',
      [id]
    );

    if (interviewerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Interviewer not found' });
    }

    // Get specialties
    const specialtiesResult = await pool.query(
      `SELECT it.name, it.description
       FROM interviewer_specialties is_
       JOIN interview_types it ON is_.interview_type_id = it.id
       WHERE is_.interviewer_id = $1`,
      [id]
    );

    const interviewer = interviewerResult.rows[0];
    interviewer.specialties = specialtiesResult.rows;

    res.json(interviewer);

  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};