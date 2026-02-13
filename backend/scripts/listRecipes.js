/**
 * List all recipes in the database (no auth required).
 * Usage: node scripts/listRecipes.js
 */
require('dotenv').config();
const connectDB = require('../config/db');
const Recipe = require('../models/Recipe');

async function run() {
  try {
    await connectDB();
    const recipes = await Recipe.find().lean();
    console.log(`\nTotal recipes in DB: ${recipes.length}\n`);
    if (recipes.length === 0) {
      console.log('No recipes found. Run: npm run seed:general');
      process.exit(0);
      return;
    }
    console.log('Sample (title, cuisine, cookingTime, tags):');
    console.log('---');
    recipes.slice(0, 20).forEach((r, i) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   cuisine: ${r.cuisine ?? '(none)'} | cookingTime: ${r.cookingTime ?? '?'} min | tags: ${(r.tags || []).join(', ') || '(none)'}`);
    });
    if (recipes.length > 20) {
      console.log(`... and ${recipes.length - 20} more.\n`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
