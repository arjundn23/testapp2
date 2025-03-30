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
    },
    fileTypes: [{
      type: String,
    }],
    categories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    sharePointFileId: {
      type: String,
      required: true,
    },
    sharePointThumbnailId: {
      type: String,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    sharedWith: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    favourites: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    downloads: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    downloadCount: {
      type: Number,
      default: 0
    },
    lastDownloadedAt: {
      type: Date
    },
    downloadHistory: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      downloadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  {
    timestamps: true,
  }
);

const File = mongoose.model("File", fileSchema);

export default File;
