import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// @desc    Register a new user
// @route   POST /api/auth/register
// @desc    Register a new user
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Validation check to ensure all required fields are provided
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide a username, email, and password' });
    }

    // 2. Check if a user already exists with either the same username OR the same email
    const userExists = await User.findOne({
      $or: [
        { username: username },
        { email: email }
      ]
    });

    // 3. If a match is found, stop execution and alert the client
    if (userExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'Registration failed. Username or Email is already taken.' 
      });
    }

    // 4. Hash the password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. Create the new user record in MongoDB Atlas
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword
    });

    // 6. Generate a JWT Token for immediate login convenience
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    res.status(201).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
// @desc    Auth user & get token (Login via Username only)
// @route   POST /api/auth/login
export const login = async (req, res) => {
  try {
    // 1. Read username and password from the request body
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both username and password' });
    }

    
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // 3. Compare the typed password with the database hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // 4. Generate JWT Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    res.status(200).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};