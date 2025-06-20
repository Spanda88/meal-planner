const GroceryList = require('../models/GroceryList');
const Recipe = require('../models/Recipe');
const { normalizeUnit } = require('../utils/unit');
const User = require('../models/User');

// Generate a grocery list by summing ingredients from multiple recipes
async function generateGroceryList(userId, recipeIds) {
  // Fetch all recipes
  const recipes = await Recipe.find({ _id: { $in: recipeIds } });

  // Aggregate ingredients
  const ingredientMap = {};
  recipes.forEach(recipe => {
    // Defensive check: Ensure recipe and its ingredients are valid
    if (recipe && Array.isArray(recipe.ingredients)) {
      recipe.ingredients.forEach(ing => {
        let normalizedUnit = normalizeUnit(ing.unit);
        if (normalizedUnit === null) {
          // Accept unitless items instead of skipping completely
          normalizedUnit = '';
        }
        const key = `${ing.name.toLowerCase()}|${normalizedUnit}`;
        let qty = parseFloat(ing.quantity);
        if (isNaN(qty) || qty === 0) qty = 1;
        if (!ingredientMap[key]) {
          ingredientMap[key] = {
            name: ing.name,
            quantity: qty,
            unit: normalizedUnit,
            checked: false,
            aisle: ing.aisle
          };
        } else {
          ingredientMap[key].quantity += qty;
        }
      });
    }
  });

  // Convert back to array, format quantity as string
  const items = Object.values(ingredientMap);

  // Create and save grocery list
  const groceryList = new GroceryList({
    user: userId,
    items,
    relatedRecipes: recipeIds
  });
  await groceryList.save();
  // Add grocery list to user's groceryLists array
  await User.findByIdAndUpdate(userId, { $push: { groceryLists: groceryList._id } });
  return groceryList;
}

// Get grocery lists by user
async function getGroceryListsByUser(userId) {
  return GroceryList.find({ user: userId }).populate('relatedRecipes');
}

// Update a grocery list
async function updateGroceryList(id, data) {
  return GroceryList.findByIdAndUpdate(id, data, { new: true });
}

// Create a new grocery list
async function createGroceryList(data) {
  // Normalize units in items
  if (Array.isArray(data.items)) {
    data.items = data.items.map(item => ({
      ...item,
      unit: normalizeUnit(item.unit)
    }));
  }
  const groceryList = new GroceryList(data);
  await groceryList.save();
  return groceryList;
}

// Get grocery list by ID
async function getGroceryListById(id) {
  return GroceryList.findById(id).populate('relatedRecipes');
}

// List all grocery lists
async function listAllGroceryLists() {
  return GroceryList.find().populate('relatedRecipes');
}

// Delete a grocery list
async function deleteGroceryList(id) {
  return GroceryList.findByIdAndDelete(id);
}

module.exports = {
  generateGroceryList,
  getGroceryListsByUser,
  updateGroceryList,
  createGroceryList,
  getGroceryListById,
  listAllGroceryLists,
  deleteGroceryList,
}; 