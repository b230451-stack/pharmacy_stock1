import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

function createToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

export async function register(request, response) {
  const { name, email, password } = request.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return response.status(400).json({
      message: 'Name, email, and password are required'
    });
  }

  if (password.length < 8) {
    return response.status(400).json({
      message: 'Password must be at least 8 characters long'
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    return response.status(409).json({ message: 'Email is already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash
  });

  return response.status(201).json({
    message: 'Registration successful',
    user: publicUser(user),
    token: createToken(user)
  });
}

export async function login(request, response) {
  const { email, password } = request.body;

  if (!email?.trim() || !password) {
    return response.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    '+passwordHash'
  );
  const passwordMatches = user
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!passwordMatches) {
    return response.status(401).json({ message: 'Invalid email or password' });
  }

  return response.json({
    message: 'Login successful',
    user: publicUser(user),
    token: createToken(user)
  });
}

export function getMe(request, response) {
  return response.json({ user: publicUser(request.user) });
}
