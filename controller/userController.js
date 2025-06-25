import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from 'crypto';
import emailService from "../services/emailService.js";
import UserActivity from '../models/userActivityModel.js';

const authUser = async (req, res) => {
  const { email, password, rememberMe, otpCode, resendOtp } = req.body;
  // Get session ID from cookies if it exists
  const sessionIdCookie = req.cookies.sessionId;

  const user = await User.findOne({ email });
  if (user && !user.isActivated)
    return res.status(401).json({ message: "Account is deactivated" });
    
  // Check if session token is missing or doesn't match what's in the database
  // This indicates the cookies were cleared manually
  const sessionCleared = !sessionIdCookie || (user && sessionIdCookie !== user.sessionToken);
    
  // Handle OTP verification separately from password verification
  if (otpCode) {
    // User is submitting OTP code
    if (user.otpCode !== otpCode) {
      return res.status(401).json({ message: "Invalid OTP code" });
    }
    
    if (user.otpExpires < new Date()) {
      return res.status(401).json({ message: "OTP code has expired" });
    }
    
    // OTP is valid, update user status
    await User.findByIdAndUpdate(user._id, {
      isOtpVerified: true,
      firstLogin: false,
      otpCode: null,
      otpExpires: null,
      lastActiveAt: new Date(),
      isOnline: true
    });
    
    // Track login activity
    await UserActivity.create({
      user: user._id,
      activityType: 'login',
      timestamp: new Date()
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: rememberMe ? "30d" : "1d",
    });

    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30 days or 1 day
    });

    return res.json({
      _id: user._id,
      name: user.username,
      email: user.email,
      isAdmin: user.isAdmin
    });
  } else if (resendOtp && user) {
    // Handle resend OTP request
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    await User.findByIdAndUpdate(user._id, {
      otpCode,
      otpExpires,
      isOtpVerified: false
    });
    
    // Send OTP email

    const logoUrl = "https://res.cloudinary.com/dhnnpddod/image/upload/v1750789107/logo1-CNx-Aou2_sxtii8.png";
    
    const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${logoUrl}" alt="Company Logo" style="max-width: 200px;">
      </div>
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px;">
        <h2 style="color: #333; margin-bottom: 20px;">One-Time Password (OTP) Verification</h2>
        <p style="color: #555; margin-bottom: 15px;">Hello ${user.username},</p>
        <p style="color: #555; margin-bottom: 15px;">Your one-time password (OTP) for login verification is:</p>
        <div style="background-color: #e8f0fe; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 5px;">
          ${otpCode}
        </div>
        <p style="color: #555; margin-bottom: 15px;">This code will expire in 10 minutes.</p>
        <p style="color: #555; margin-bottom: 15px;">If you did not request this code, please ignore this email.</p>
      </div>
      <div style="margin-top: 20px; text-align: center; color: #777; font-size: 12px;">
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    </div>
    `;
    
    await emailService.sendMail(user.email, "Your Login Verification Code", html);
    
    return res.status(200).json({ 
      message: "New OTP code sent successfully", 
      requireOtp: true,
      email: user.email
    });
  }
  
  // Normal login with password
  if (user && (await user.matchPassword(password))) {
    // Check if OTP verification is needed
    if (otpCode) {
      // User is submitting OTP code
      if (user.otpCode !== otpCode) {
        return res.status(401).json({ message: "Invalid OTP code" });
      }
      
      if (user.otpExpires < new Date()) {
        return res.status(401).json({ message: "OTP code has expired" });
      }
      
      // OTP is valid, update user status
      await User.findByIdAndUpdate(user._id, {
        isOtpVerified: true,
        firstLogin: false,
        otpCode: null,
        otpExpires: null,
        lastActiveAt: new Date(),
        isOnline: true
      });
    } else {
      // Check if OTP verification is needed
      // Require OTP for first login, when isOtpVerified is false, or when session cookies were cleared
      if (user.firstLogin || !user.isOtpVerified || sessionCleared) {
        // Generate and send OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        await User.findByIdAndUpdate(user._id, {
          otpCode,
          otpExpires,
          isOtpVerified: false
        });

        // Send OTP email
        const logoUrl = "https://res.cloudinary.com/dhnnpddod/image/upload/v1750789107/logo1-CNx-Aou2_sxtii8.png";
        
        const html = `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${logoUrl}" alt="Company Logo" style="max-width: 200px;">
          </div>
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px;">
            <h2 style="color: #333; margin-bottom: 20px;">One-Time Password (OTP) Verification</h2>
            <p style="color: #555; margin-bottom: 15px;">Hello ${user.username},</p>
            <p style="color: #555; margin-bottom: 15px;">Your one-time password (OTP) for login verification is:</p>
            <div style="background-color: #e8f0fe; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 5px;">
              ${otpCode}
            </div>
            <p style="color: #555; margin-bottom: 15px;">This code will expire in 10 minutes.</p>
            <p style="color: #555; margin-bottom: 15px;">If you did not request this code, please ignore this email.</p>
          </div>
          <div style="margin-top: 20px; text-align: center; color: #777; font-size: 12px;">
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
        `;
        
        await emailService.sendMail(user.email, "Your Login Verification Code", html);
        
        return res.status(200).json({ 
          message: "OTP verification required", 
          requireOtp: true,
          email: user.email
        });
      }
      
      // Update user status for normal login
      await User.findByIdAndUpdate(user._id, {
        lastActiveAt: new Date(),
        isOnline: true
      });
    }

    // Track login activity
    await UserActivity.create({
      user: user._id,
      activityType: 'login',
      timestamp: new Date()
    });

    // Generate a unique session token to detect cleared cookies
    const sessionToken = Math.random().toString(36).substring(2, 15) + 
                        Math.random().toString(36).substring(2, 15);
    
    // Store the session token in the database
    await User.findByIdAndUpdate(user._id, {
      sessionToken: sessionToken
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: rememberMe ? "30d" : "1d",
    });

    // Set the JWT token cookie
    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30 days or 1 day
    });
    
    // Set a separate session token cookie to detect cleared cookies
    res.cookie("sessionId", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30 days or 1 day
    });

    res.json({
      _id: user._id,
      name: user.username,
      email: user.email,
      isAdmin: user.isAdmin
    });
  } else {
    res.status(401).json({ message: "Invalid email or password" });
  }
};

const logoutUser = async (req, res) => {
  // The protect middleware ensures req.user exists
  // Update user status and reset OTP verification
  await User.findByIdAndUpdate(req.user._id, {
    isOnline: false,
    isOtpVerified: false // Reset OTP verification flag when logging out
  });

  // Track logout activity
  await UserActivity.create({
    user: req.user._id,
    activityType: 'logout',
    timestamp: new Date()
  });

  // Clear JWT cookie
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0),
  });
  
  // Clear session token cookie
  res.cookie("sessionId", "", {
    httpOnly: true,
    expires: new Date(0),
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
    console.log(req.body);
    if (user) {
      user.username = req.body.username || user.username;
      user.email = req.body.email || user.email;
      
      // Handle isAdmin field
      if (req.body.isAdmin !== undefined) {
        user.isAdmin = req.body.isAdmin;
      } else if (req.body.role !== undefined) {
        user.isAdmin = req.body.role === 'admin';
      }
      
      // Update profile picture if provided
      if (req.body.profilePicture) {
        user.profilePicture = req.body.profilePicture;
      }
      
      // Update allowed categories for non-admin users
      if (!user.isAdmin && req.body.allowedCategories) {
        user.allowedCategories = req.body.allowedCategories;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        profilePicture: updatedUser.profilePicture,
        allowedCategories: updatedUser.allowedCategories
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
  const { name, email, isAdmin, allowedCategories } = req.body;
  let p1 = btoa(name);
  let p2 = new Date().getTime();
  let p3 = btoa(p2);
  let token = p1 + p2 + p3;
  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: "User already exists" });
  }

  // Create user object with basic info
  const userData = {
    username: name,
    email: email,
    password: Math.random().toString(36).slice(-8),
    loginToken: token,
    isAdmin: isAdmin,
  };
  
  // Add allowedCategories only for non-admin users
  if (!isAdmin && allowedCategories && allowedCategories.length > 0) {
    userData.allowedCategories = allowedCategories;
  }

  const user = await User.create(userData);

  if (user) {
    const registrationLink = `${process.env.FRONTEND_URL}/link?t=${token}`;

    // Send Email
    const subject = "You’ve Been Invited to Join the Independents by Sodexo Digital Portal";

    const logoUrl = "https://res.cloudinary.com/dhnnpddod/image/upload/v1750789107/logo1-CNx-Aou2_sxtii8.png";
const html = `
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;font-family:sans-serif;">
    <div style="background:#f7f7f7;padding:24px 0;text-align:center;">
      <img src="${logoUrl}" alt="Portal Logo" style="height:60px;max-width:90%;margin:auto;display:block;" />
    </div>
    <div style="padding:32px 24px 24px 24px;">
      <p style="font-size:18px;margin-bottom:10px;color:#222;">Hi,</p>
      <p style="font-size:16px;color:#333;">You’ve been invited to join the <b>Independents by Sodexo Digital Portal</b> – your central space for shared resources, documents, and team collaboration.</p>
<p style="font-size:15px;color:#333;margin-bottom:8px;">Click below to activate your account:</p>
      <div style="background:#f6f6fa;padding:16px 12px;margin:18px 0 14px 0;border-radius:6px;font-size:15px;text-align:center;">
        <a href="${registrationLink}" target="_blank" style="display:inline-block;padding:10px 18px;background:#f58220;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;font-size:15px;">Join the Portal</a>
      </div>
      <p style="font-size:13px;color:#666;margin:14px 0 0 0;">If this wasn’t intended for you, feel free to disregard this email.</p>
      <p style="font-size:14px;color:#888;margin-top:28px;">Best Regards,<br/>Independents by Sodexo Digital Portal Team</p>
    </div>
  </div>
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
    const subject = "Reset Your Independents by Sodexo Digital Portal Password";
    const logoUrl = "https://res.cloudinary.com/dhnnpddod/image/upload/v1750789107/logo1-CNx-Aou2_sxtii8.png";
const html = `
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;font-family:sans-serif;">
    <div style="background:#f7f7f7;padding:24px 0;text-align:center;">
      <img src="${logoUrl}" alt="Portal Logo" style="height:60px;max-width:90%;margin:auto;display:block;" />
    </div>
    <div style="padding:32px 24px 24px 24px;">
      <p style="font-size:18px;margin-bottom:10px;color:#222;">Hi ${user.username},</p>
      <p style="font-size:16px;color:#333;">We received a request to reset the password for your <b>Independents by Sodexo Digital Portal</b> account.</p>
<p style="font-size:15px;color:#333;margin-bottom:8px;">To set a new password, please click the link below:</p>
      <div style="background:#f6f6fa;padding:16px 12px;margin:18px 0 14px 0;border-radius:6px;font-size:15px;text-align:center;">
        <a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#0079c1;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;font-size:15px;">Reset Your Password</a>
      </div>
      <p style="font-size:13px;color:#666;margin:14px 0 0 0;">If you didn’t request this, you can ignore this message.</p>
      <p style="font-size:14px;color:#888;margin-top:28px;">Best Regards,<br/>Independents by Sodexo Digital Portal Team</p>
    </div>
  </div>
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