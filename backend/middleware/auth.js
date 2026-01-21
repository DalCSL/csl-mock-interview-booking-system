import jwt from 'jsonwebtoken';

export const verifyStudentToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'student') {
      return res.status(403).json({ error: 'Invalid token type' });
    }
    
    req.student = { email: decoded.email };
    next();
    
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const verifyInterviewerToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'interviewer') {
      return res.status(403).json({ error: 'Invalid token type' });
    }
    
    req.interviewer = { 
      id: decoded.id,
      email: decoded.email 
    };
    next();
    
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};