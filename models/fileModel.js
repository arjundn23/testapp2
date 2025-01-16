import mongoose from "mongoose";

const fileSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    fileTypes: [{
      type: String,
      enum: ['operate it collateral', 'images', 'videos', 'sell it collateral'],
      required: true
    }],
    categories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    thumbnailUrl: {
      type: String,
      required: false,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    downloadUrl: {
      type: String,
      required: false,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    sharePointFileId: {
      type: String,
      required: true,
    },
    sharedWith: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
  },
  {
    timestamps: true,
  }
);

const File = mongoose.model("File", fileSchema);

export default File;
