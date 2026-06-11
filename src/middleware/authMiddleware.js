import jwt from 'jsonwebtoken';
import supabase from '../config/db.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ ok: false, message: 'No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, full_name, role, active')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ ok: false, message: 'Invalid token or user not found.' });
    }
    req.user = user; // Attach user info to the request
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: 'Unauthorized: Invalid or expired token.' });
  }
};