import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = mongoose.Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, required: true, default: false },
    isActivated: { type: Boolean, required: true, default: true },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    loginToken: { type: String },
    profilePicture: { type: String },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Get Profile Picture
userSchema.methods.getProfilePicture = function () {
  if (this.profilePicture && this.profilePicture.data) {
    return `data:${
      this.profilePicture.contentType
    };base64,${this.profilePicture.data.toString("base64")}`;
  }
  return "default-profile.png";
};

const User = mongoose.model("User", userSchema);
export default User;
