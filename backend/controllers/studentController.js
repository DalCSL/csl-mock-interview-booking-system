import pool from '../db/pool.js';
import jwt from 'jsonwebtoken';
import { sendVerificationCode } from '../services/email.js';

const generateCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export const requestCode = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required '});
    }

    if (!email.toLowerCase().endsWith('@dal.ca')) {
        return res.status(400).json({ error: 'Must use a @dal.ca email address' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {

        // Invalidate any existing unused codes for this email
        await pool.query(
            `UPDATE verification_codes
            SET expires_at = NOW()
            WHERE email = $1 AND verified_at is NULL`, 
            [normalizedEmail]
        );

        // Generate new code
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save to database
        await pool.query(
            `INSERT INTO verification_codes (email, code, expires_at)
            VALUES ($1, $2, $3)`,
            [normalizedEmail, code, expiresAt]
        );

        // Send email (logs to console for now)
        await sendVerificationCode(normalizedEmail, code);

        res.json({ message: 'Verification code sent to your email' });
    } catch (error) {
        console.error('Request code error: ', error);
        res.status(500).json({ error: 'Failed to send verification code' });
    }
};

export const verifyCode = async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required '});
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
        // Find valid code
        const result = await pool.query(
            `SELECT id FROM verification_codes
            WHERE email = $1
            AND CODE = $2
            AND expires_at > NOW()
            AND verified_at IS NULL`,
            [normalizedEmail, code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        // Mark code as used

        await pool.query(
            `UPDATE verification_codes SET verified_at = NOW() WHERE id = $1`,
            [result.rows[0].id]
        )
        
        // Generate JWT (valid for 1 hour)
        const token = jwt.sign(
            { email: normalizedEmail, type: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            message: 'Email verified',
            token
        });
    } catch (error) {
        console.error('Verify code error: ', error);
        res.status(500).json({ error: 'Failed to verify code'});
    }
};

export const getMe = async (req, res) => {
    const { email } = req.student;

    try {
        // Get active booking (not cancelled, in the future)
        const bookingResult = await pool.query(
            `SELECT 
                b.id,
                b.student_name,
                b.teams_meeting_url,
                b.created_at as booked_at,
                s.start_time,
                s.end_time,
                i.name as interviewer_name
            FROM bookings b
            JOIN availability_slots s ON b.slot_id = s.id
            JOIN interviewers i ON s.interviewer_id = i.id
            WHERE b.student_email = $1
                AND b.cancelled_at IS NULL
                AND s.start_time > NOW()
            ORDER BY s.start_time
            LIMIT 1`,
            [email]
        );

        const activeBooking = bookingResult.rows[0] || null;

        res.json({
            email,
            activeBooking,
            canBook: !activeBooking
        });
    } catch (error) {
        console.error('Get student error: ', error);
        res.status(500).json({ error: 'Failed to get student info' });    
    }
};