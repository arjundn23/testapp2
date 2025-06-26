import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = mongoose.Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePicture: { type: String, default: '/default-profile.png' },
    isAdmin: { type: Boolean, required: true, default: false },
    isActivated: { type: Boolean, required: true, default: true },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    loginToken: { type: String },
    lastActiveAt: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    otpCode: { type: String },
    otpExpires: { type: Date },
    isOtpVerified: { type: Boolean, default: false },
    firstLogin: { type: Boolean, default: true },
    sessionToken: { type: String },
    allowedCategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    downloadedFiles: [
      {
        fileId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'File'
        },
        downloadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
