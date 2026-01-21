import pool from '../db/pool.js';

// Interviewer gets their own slots
export const getMySlots = async (req, res) => {
  const { id } = req.interviewer;

  try {
    const result = await pool.query(
      `SELECT 
         s.id,
         s.start_time,
         s.end_time,
         s.is_booked,
         s.created_at,
         it.name as interview_type,
         CASE 
           WHEN b.id IS NOT NULL THEN json_build_object(
             'id', b.id,
             'student_name', b.student_name,
             'student_email', b.student_email
           )
           ELSE NULL
         END as booking
       FROM availability_slots s
       JOIN interview_types it ON s.interview_type_id = it.id
       LEFT JOIN bookings b ON s.id = b.slot_id AND b.cancelled_at IS NULL
       WHERE s.interviewer_id = $1
       ORDER BY s.start_time`,
      [id]
    );

    res.json({ slots: result.rows });

  } catch (error) {
    console.error('Get my slots error:', error);
    res.status(500).json({ error: 'Failed to get slots' });
  }
};

// Interviewer creates a slot
export const createSlot = async (req, res) => {
  const { id } = req.interviewer;
  const { start_time, end_time, interview_type } = req.body;

  if (!start_time || !end_time || !interview_type) {
    return res.status(400).json({ 
      error: 'start_time, end_time, and interview_type are required' 
    });
  }

  // Validate times
  const start = new Date(start_time);
  const end = new Date(end_time);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  if (start >= end) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  if (start < new Date()) {
    return res.status(400).json({ error: 'Cannot create slots in the past' });
  }

  try {
    // Verify interview type exists and interviewer has this specialty
    const specialtyCheck = await pool.query(
      `SELECT it.id 
       FROM interview_types it
       JOIN interviewer_specialties isp ON it.id = isp.interview_type_id
       WHERE it.name = $1 AND isp.interviewer_id = $2`,
      [interview_type, id]
    );

    if (specialtyCheck.rows.length === 0) {
      return res.status(400).json({ 
        error: 'You do not have this specialty or it does not exist' 
      });
    }

    const interviewTypeId = specialtyCheck.rows[0].id;

    // Check for overlapping slots
    const overlapCheck = await pool.query(
      `SELECT id FROM availability_slots
       WHERE interviewer_id = $1
       AND start_time < $3
       AND end_time > $2`,
      [id, start, end]
    );

    if (overlapCheck.rows.length > 0) {
      return res.status(400).json({ error: 'This time overlaps with an existing slot' });
    }

    // Create the slot
    const result = await pool.query(
      `INSERT INTO availability_slots (interviewer_id, interview_type_id, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       RETURNING id, start_time, end_time, is_booked, created_at`,
      [id, interviewTypeId, start, end]
    );

    res.status(201).json({
      message: 'Slot created',
      slot: {
        ...result.rows[0],
        interview_type
      }
    });

  } catch (error) {
    console.error('Create slot error:', error);
    res.status(500).json({ error: 'Failed to create slot' });
  }
};

// Interviewer deletes a slot
export const deleteSlot = async (req, res) => {
  const { id: interviewerId } = req.interviewer;
  const { id: slotId } = req.params;

  try {
    // Check slot exists and belongs to this interviewer
    const slotCheck = await pool.query(
      `SELECT id, is_booked FROM availability_slots
       WHERE id = $1 AND interviewer_id = $2`,
      [slotId, interviewerId]
    );

    if (slotCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (slotCheck.rows[0].is_booked) {
      return res.status(400).json({ 
        error: 'Cannot delete a booked slot. Ask the student to cancel first.' 
      });
    }

    // Delete the slot
    await pool.query('DELETE FROM availability_slots WHERE id = $1', [slotId]);

    res.json({ message: 'Slot deleted' });

  } catch (error) {
    console.error('Delete slot error:', error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
};

// Students get available slots (filtered by interview type)
export const getAvailableSlots = async (req, res) => {
  const { type } = req.query;

  if (!type) {
    return res.status(400).json({ error: 'Interview type is required (e.g., ?type=Technical)' });
  }

  try {
    const result = await pool.query(
      `SELECT 
         s.id,
         s.start_time,
         s.end_time,
         it.name as interview_type,
         i.name as interviewer_name
       FROM availability_slots s
       JOIN interview_types it ON s.interview_type_id = it.id
       JOIN interviewers i ON s.interviewer_id = i.id
       WHERE it.name = $1
         AND s.is_booked = FALSE
         AND s.start_time > NOW()
       ORDER BY s.start_time`,
      [type]
    );

    res.json({ slots: result.rows });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ error: 'Failed to get available slots' });
  }
};

// Get interview types (for dropdowns)
export const getInterviewTypes = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description FROM interview_types ORDER BY name'
    );

    res.json({ types: result.rows });

  } catch (error) {
    console.error('Get interview types error:', error);
    res.status(500).json({ error: 'Failed to get interview types' });
  }
};