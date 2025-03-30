import mongoose from 'mongoose';

const userActivitySchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    activityType: {
      type: String,
      enum: ['login', 'download', 'upload', 'logout'],
      required: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
userActivitySchema.index({ timestamp: -1 });
userActivitySchema.index({ user: 1, timestamp: -1 });

const UserActivity = mongoose.model('UserActivity', userActivitySchema);

export default UserActivity;
