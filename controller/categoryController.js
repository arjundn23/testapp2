import Category from "../models/categoryModel.js";
import User from "../models/userModel.js";

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    // Get all categories sorted by creation date
    const categories = await Category.find({}).sort({ createdAt: -1 });
    
    // Check if user is admin
    if (req.user.isAdmin) {
      // Admins can see all categories
      return res.json(categories);
    }
    
    // For regular users, get their allowed categories
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // If user has allowedCategories, filter the categories
    if (user.allowedCategories && user.allowedCategories.length > 0) {
      // Convert user's allowed categories to string IDs for comparison
      const allowedCategoryIds = user.allowedCategories.map(cat => 
        cat.toString()
      );
      
      // Filter categories to only include those the user has access to
      const filteredCategories = categories.filter(category => 
        allowedCategoryIds.includes(category._id.toString())
      );
      
      return res.json(filteredCategories);
    } else {
      // If user has no allowed categories, return an empty array
      return res.json([]);
    }
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
      res.status(400);
      throw new Error("Category already exists");
    }

    const category = await Category.create({
      name,
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const category = await Category.findById(req.params.id);

    if (category) {
      category.name = name;
      const updatedCategory = await category.save();
      res.json(updatedCategory);
    } else {
      res.status(404);
      throw new Error("Category not found");
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (category) {
      await Category.deleteOne({ _id: category._id });
      res.json({ message: "Category removed" });
    } else {
      res.status(404);
      throw new Error("Category not found");
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export { getCategories, createCategory, updateCategory, deleteCategory };
