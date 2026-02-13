/**
 * Seed the database with general recipes from Spoonacular (no cuisine, diet, or time filters).
 * Requires SPOONACULAR_API_KEY in backend/.env.
 *
 * Usage:
 *   node scripts/seedGeneral.js           # fetches 30 recipes (10 per batch, 3 batches)
 *   node scripts/seedGeneral.js 50        # fetch 50 total (e.g. 5 batches of 10)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../config/db');
const { seedRecipes } = require('../services/spoonacularService');

const BATCH_SIZE = 10; // recipes per API request (Spoonacular allows up to 100; lower = less quota per call)

async function run() {
  if (!process.env.SPOONACULAR_API_KEY) {
    console.error('SPOONACULAR_API_KEY is missing. Add it to backend/.env (get a key at https://spoonacular.com/food-api).');
    process.exit(1);
  }

  const totalWanted = Math.min(parseInt(process.argv[2], 10) || 30, 100);
  const maxBatches = Math.ceil(totalWanted / BATCH_SIZE);

  try {
    await connectDB();
    console.log(`Seeding up to ${totalWanted} general recipes (no filters)...`);
    const result = await seedRecipes({ batchSize: BATCH_SIZE, maxBatches });
    console.log('Done. Inserted:', result.recipes?.length ?? 0, 'recipes');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

run();
