import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { config } from '../config';
import logger from '../services/logger';

const generateTokens = (user: { id: string; role: string }) => {
  const accessToken = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: '15m',
  });
  const refreshToken = jwt.sign({ id: user.id, role: user.role }, config.jwtRefreshSecret, {
    expiresIn: '7d',
  });
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      res.status(400).json({ error: 'Username or email already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role || 'user',
    });

    await newUser.save();
    logger.info(`User registered successfully: ${newUser.username}`);

    const { accessToken, refreshToken } = generateTokens({
      id: newUser._id.toString(),
      role: newUser.role,
    });

    newUser.refreshTokens.push(refreshToken);
    await newUser.save();

    res.status(201).json({
      message: 'User registered successfully',
      accessToken,
      refreshToken,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const { accessToken, refreshToken } = generateTokens({
      id: user._id.toString(),
      role: user.role,
    });

    user.refreshTokens.push(refreshToken);
    await user.save();
    logger.info(`User logged in: ${user.username}`);

    res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const refreshToken = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const decoded = jwt.verify(token, config.jwtRefreshSecret) as {
      id: string;
      role: 'admin' | 'user';
    };

    const user = await User.findById(decoded.id);
    if (!user || !user.refreshTokens.includes(token)) {
      res.status(403).json({ error: 'Invalid or revoked refresh token' });
      return;
    }

    // Remove current refresh token and generate new pair
    user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
    const tokens = generateTokens({ id: user._id.toString(), role: user.role });

    user.refreshTokens.push(tokens.refreshToken);
    await user.save();

    res.status(200).json(tokens);
    return;
  } catch (error) {
    logger.warn(`Refresh token failed: ${error}`);
    res.status(403).json({ error: 'Invalid refresh token' });
    return;
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Token required' });
      return;
    }

    const decoded = jwt.decode(token) as { id: string } | null;
    if (decoded) {
      const user = await User.findById(decoded.id);
      if (user) {
        user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
        await user.save();
      }
    }

    res.status(200).json({ message: 'Logged out successfully' });
    return;
  } catch (error) {
    next(error);
    return;
  }
};
