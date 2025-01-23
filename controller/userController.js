import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from 'crypto';
import emailService from "../services/emailService.js";

const authUser = async (req, res) => {
  const { email, password, rememberMe } = req.body;

  const user = await User.findOne({ email });
  if (user && !user.isActivated)
    return res.status(401).json({ message: "Account is deactivated" });
  if (user && (await user.matchPassword(password))) {
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: rememberMe ? "30d" : "1d",
    });

    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30 days or 1 day
    });

    res.json({
      _id: user._id,
      name: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
    });
  } else {
    res.status(401).json({ message: "Invalid email or password" });
  }
};

const logoutUser = async (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
    expires: new Date(0),
    maxAge: 0,
    path: "/"
  });

  res.status(200).json({ message: "Logged out successfully" });
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { name, email, password, profilePic } = req.body;

    const user = await User.findOne({ email });

    if (user) {
      user.username = name || user.username;

      if (password) {
        // Let the model's pre-save middleware handle password hashing
        user.password = password;
      }

      user.profilePicture = profilePic;

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.username,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        profilePicture: updatedUser.profilePicture,
      });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: "Error updating user profile" });
  }
};

const updateTokenUserProfile = async (req, res) => {
  const { name, email, password } = req.body;

  const user = await User.findOne({ email });

  if (user) {
    user.username = name || user.username;

    if (password) {
      user.password = password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.username,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
    });
  } else {
    res.status(404).json({ message: "User not found" });
  }
};

const getUsers = async (req, res) => {
  const users = await User.find({});
  res.json(users);
};

const deleteUser = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res
      .status(200)
      .json({ message: "User deleted successfully", user: deletedUser });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActivated = !user.isActivated;
    await user.save();

    res.status(200).json({ message: "User update successfully", user });
  } catch (error) {
    console.error("Error on updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      user.username = req.body.username || user.username;
      user.email = req.body.email || user.email;
      user.isAdmin = req.body.role === 'admin';

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    return res.json(user);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
};

const getUserByToken = async (req, res) => {
  const token = req.params.token;
  const user = await User.findOne({ loginToken: token });

  if (user) {
    return res.json(user);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
};

const registerUserAndGenerateLink = async (req, res) => {
  const { name, email, isAdmin } = req.body;
  let p1 = btoa(name);
  let p2 = new Date().getTime();
  let p3 = btoa(p2);
  let token = p1 + p2 + p3;
  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const user = await User.create({
    username: name,
    email: email,
    password: Math.random().toString(36).slice(-8),
    loginToken: token,
    isAdmin: isAdmin,
  });

  if (user) {
    const registrationLink = `${process.env.FRONTEND_URL}/link?t=${token}`;

    // Send Email
    const subject = "Resource Portal Scope";

    const html = `
        <p>Hi,</p>
        <p>This is your joining link:</p>
        <a href="${registrationLink}" target="_blank">Click here to join</a>
        <p>Best regards,</p>
        <p>Resource Portal Team</p>
      `;

    await emailService.sendMail(user.email, subject, html);

    res.status(201).json({
      message: "User registered successfully",
      // link: registrationLink,
    });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
};

const forgetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email
    const subject = "Password Reset Request";
    const html = `
        <h2>Hello ${user.username},</h2>
        <p>You requested a password reset for your Resource Portal account.</p>
        <p>Please click the following link to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Best regards,<br/>Resource Portal Team</p>
      `;

    await emailService.sendMail(user.email, subject, html);
    res.json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Error in forget password:", error);
    res.status(500).json({ message: "Error sending reset email" });
  }
};

const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Error in reset password:", error);
    res.status(500).json({ message: "Error resetting password" });
  }
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  const subject = "Password Reset Request";
  const html = `
    <h1>You have requested a password reset</h1>
    <p>Please click the following link to reset your password:</p>
    <a href="${resetUrl}">${resetUrl}</a>
    <p>If you did not request this, please ignore this email.</p>
  `;

  await emailService.sendMail(user.email, subject, html);
};

// Search users by email
const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    const users = await User.find({
      $or: [
        { email: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } }
      ]
    })
    .select('username email profilePicture')
    .limit(5);

    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ 
      message: 'Error searching users',
      error: error.message 
    });
  }
};

export {
  authUser,
  logoutUser,
  getUserProfile,
  updateUser,
  updateUserProfile,
  getUsers,
  deleteUser,
  getUserById,
  registerUserAndGenerateLink,
  getUserByToken,
  updateTokenUserProfile,
  deactivateUser,
  forgetPassword,
  resetPassword,
  searchUsers,
};