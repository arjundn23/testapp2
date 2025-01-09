import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false,
    },
    category: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      required: false,
    },
    file: {
      type: String,
      required: false,
    },
    size: {
      type: String,
      required: false,
    },
    image: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

const File = mongoose.model("File", userSchema);
export default File;
