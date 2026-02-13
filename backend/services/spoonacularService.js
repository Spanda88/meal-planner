const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const axios = require('axios');
const Recipe = require('../models/Recipe');
const GroceryList = require('../models/GroceryList');
const mongoose = require('mongoose');
const { normalizeAisle } = require('../utils/transformSpoonacular');

const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;
const SPOONACULAR_BASE_URL = 'https://api.spoonacular.com/recipes';

// Debug log to check API key
// console.log('SPOONACULAR_API_KEY:', SPOONACULAR_API_KEY);

// Helper: axios with retry on 429/quota-exceeded
async function axiosWithRetry(config, maxRetries = 5, initialDelay = 1000) {
  let attempt = 0;
  let delay = initialDelay;
  while (true) {
    try {
      // Ensure params are included in the request
      const requestConfig = {
        ...config,
        params: {
          ...config.params,
          apiKey: SPOONACULAR_API_KEY
        }
      };
      return await axios(requestConfig);
    } catch (error) {
      const status = error.response?.status;
      const quotaExceeded = error.response?.data?.message?.toLowerCase().includes('quota') || false;
      if ((status === 429 || quotaExceeded) && attempt < maxRetries) {
        attempt++;
        console.warn(`Spoonacular rate limit/quota hit. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2; // Exponential back-off
      } else {
        throw error;
      }
    }
  }
}

// Function to seed the database with recipes (no filters — general recipes only).
// Options: { batchSize: 10, maxBatches: 5 } — batchSize per request, maxBatches = how many requests.
async function seedRecipes(options = {}) {
  const maxBatchSize = options.batchSize ?? 10;
  const maxBatches = options.maxBatches ?? 5;

  try {
    // Check if we're connected to MongoDB
    if (mongoose.connection.readyState !== 1) {
      console.log('Waiting for MongoDB connection...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected');
      }
    }

    let offset = 0;
    let totalRecipesFetched = 0;
    let totalResults = Infinity; // Will be updated with first API call

    let batchCount = 0;

    // NEW: keep track of everything we insert so we can safely return it later
    const insertedRecipes = [];
    // NEW: keep the most recent API response for pagination info
    let lastApiResponse = null;

    while (batchCount < maxBatches) {
      // Calculate how many recipes to request
      const remainingRecipes = totalResults - totalRecipesFetched;
      const batchSize = remainingRecipes < maxBatchSize ? remainingRecipes : maxBatchSize;
      
      // If no more recipes to fetch, break
      if (batchSize <= 0) {
        console.log('No more recipes available to fetch');
        break;
      }

      console.log(`Fetching recipes with offset ${offset}...`);
      const response = await axiosWithRetry({
        method: 'get',
        url: `${SPOONACULAR_BASE_URL}/complexSearch`,
        params: {
          number: batchSize,
          offset: offset,   
          // offset is the number of recipes to skip before starting to fetch and
          // prevents us from fetching the same recipes over and over again
          addRecipeInformation: true,
          fillIngredients: true,
          instructionsRequired: true
        }
      });

      // Update totalResults on first call
      if (totalResults === Infinity) {
        totalResults = response.data.totalResults;
        console.log(`Total recipes available: ${totalResults}`);
      }

      // Check if we got any results
      if (response.data.results.length === 0) {
        console.log('No more recipes available to fetch');
        break;
      }

      const recipes = response.data.results.map(recipe => ({
        apiId: recipe.id,
        title: recipe.title,
        ingredients: recipe.extendedIngredients.map(ing => ({
          name: ing.name,
          quantity: ing.amount,
          unit: ing.unit,
          aisle: normalizeAisle(ing.aisle) // normalize to our 7 categories
        })),
        instructions: recipe.analyzedInstructions[0]?.steps.map(step => ({
          step: step.number,
          text: step.step
        })) || [],
        tags: recipe.dishTypes || [],
        cuisine: (recipe.cuisines?.[0] || '').toLowerCase(),
        cookingTime: recipe.readyInMinutes,
        servingSize: recipe.servings,
        nutrition: recipe.nutrition,
        image: recipe.image,
        sourceUrl: recipe.sourceUrl
      }));

      const apiIds = recipes.map(r => r.apiId);
      const existing = await Recipe.find({ apiId: { $in: apiIds } }).select('apiId').lean();
      const existingSet = new Set(existing.map(e => String(e.apiId)));
      const toInsert = recipes.filter(r => !existingSet.has(String(r.apiId)));
      if (toInsert.length === 0) {
        console.log(`Batch at offset ${offset}: all ${recipes.length} already in DB, skipping.`);
      } else {
        console.log(`Inserting ${toInsert.length} new recipes (${recipes.length - toInsert.length} already in DB)...`);
        const result = await Recipe.insertMany(toInsert);
        console.log(`Successfully inserted ${result.length} recipes`);
        insertedRecipes.push(...result);
      }

      totalRecipesFetched += recipes.length;
      offset += recipes.length; // Use actual number of recipes received for next offset

      // Save for later pagination calculation
      lastApiResponse = response;

      // Add a small delay to avoid hitting API rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      batchCount++;
    }

    console.log(`Finished seeding database. Total recipes inserted: ${totalRecipesFetched}`);
    return {
      recipes: insertedRecipes,
      pagination: {
        currentOffset: offset,
        totalFetched: totalRecipesFetched,
        totalAvailable: totalResults,
        hasMore: totalRecipesFetched < totalResults,
        isComplete:
          totalRecipesFetched >= totalResults || (lastApiResponse && lastApiResponse.data.results.length === 0)
      }
    };
  } catch (error) {
    console.error('Error seeding recipes:', error);
    throw error;
  }
}

// Function to fetch detailed info for selected recipes
async function fetchDetailedRecipes(recipeIds) {
  try {
    const response = await axiosWithRetry({
      method: 'get',
      url: `${SPOONACULAR_BASE_URL}/informationBulk`,
      params: {
        ids: recipeIds.join(',')
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching detailed recipes:', error);
    throw error;
  }
}

// Function to fetch and seed a random recipe
async function seedRandomRecipe() {
  try {
    // Check if we're connected to MongoDB
    if (mongoose.connection.readyState !== 1) {
      console.log('Waiting for MongoDB connection...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected');
      }
    }

    const response = await axiosWithRetry({
      method: 'get',
      url: `${SPOONACULAR_BASE_URL}/random`,
      params: {
        number: 1,
        addRecipeInformation: true,
        fillIngredients: true,
        instructionsRequired: true
      }
    });

    const recipe = response.data.recipes[0];
    const formattedRecipe = {
      apiId: recipe.id,
      title: recipe.title,
      ingredients: recipe.extendedIngredients.map(ing => ({
        name: ing.name,
        quantity: ing.amount,
        unit: ing.unit,
        aisle: normalizeAisle(ing.aisle)
      })),
      instructions: recipe.analyzedInstructions[0]?.steps.map(step => ({
        step: step.number,
        text: step.step
      })) || [],
      tags: recipe.dishTypes || [],
      cuisine: (recipe.cuisines?.[0] || '').toLowerCase(),
      cookingTime: recipe.readyInMinutes,
      servingSize: recipe.servings,
      nutrition: recipe.nutrition,
      image: recipe.image,
      sourceUrl: recipe.sourceUrl
    };

    const result = await Recipe.create(formattedRecipe);
    return result;
  } catch (error) {
    console.error('Error seeding random recipe:', error);
    throw error;
  }
}

// Search Spoonacular for recipes based on preferences and save new ones to DB
async function searchRecipes(preferences) {
  try {
    const params = {
      apiKey: SPOONACULAR_API_KEY,
      number: 48,
      addRecipeInformation: true,
      fillIngredients: true,
      instructionsRequired: true
    };
    if (preferences.cuisineTypes?.length) {
      params.cuisine = preferences.cuisineTypes.join(',');
    }
    if (preferences.dietaryRestrictions?.length) {
      params.diet = preferences.dietaryRestrictions.join('|');
    }
    // Cook time mapping
    if (preferences.cookTimeCategory === 'Hangry') {
      params.maxReadyTime = 20;
    } else if (preferences.cookTimeCategory === 'Hungry') {
      params.maxReadyTime = 40;
    } else if (preferences.cookTimeCategory === 'Patient') {
    }
    
    if (preferences.servingSize) {
      params.minServings = preferences.servingSize;
    }

    const response = await axiosWithRetry({
      method: 'get',
      url: `${SPOONACULAR_BASE_URL}/complexSearch`,
      params
    });

    let results = response.data.results || [];
    
    console.log(`[SPOON] Received ${results.length} results from API`);
    console.log('[SPOON] First few recipe titles:', results.slice(0, 3).map(r => r.title));

    // Filter for lower bound if needed
    if (preferences.cookTimeCategory === 'Hangry') {
      results = results.filter(r => r.readyInMinutes <= 20);
    } else if (preferences.cookTimeCategory === 'Hungry') {
      results = results.filter(r => r.readyInMinutes <= 40);
    } 

    const newRecipes = [];
    for (const recipe of results) {
      const exists = await Recipe.findOne({ apiId: recipe.id });
      if (!exists) {
        const formatted = {
          apiId: recipe.id,
          title: recipe.title,
          ingredients: recipe.extendedIngredients?.map(ing => ({
            name: ing.name,
            quantity: ing.amount,
            unit: ing.unit,
            aisle: normalizeAisle(ing.aisle) // normalize to our 7 categories
          })) || [],
          instructions: recipe.analyzedInstructions?.[0]?.steps.map(step => ({
            step: step.number,
            text: step.step
          })) || [],
          tags: [
            ...(recipe.dishTypes || []),
            ...(recipe.vegan ? ['vegan'] : []),
            ...(recipe.vegetarian ? ['vegetarian'] : []),
            ...(recipe.glutenFree ? ['gluten-free'] : []),
            ...(recipe.dairyFree ? ['dairy-free'] : []),
            ...(recipe.veryHealthy ? ['healthy'] : []),
            ...(recipe.cuisines || []), // Add cuisines as tags for better matching
          ],
          cuisine: (recipe.cuisines?.[0] || '').toLowerCase(),
          cookingTime: recipe.readyInMinutes,
          servingSize: recipe.servings,
          nutrition: recipe.nutrition,
          image: recipe.image,
          sourceUrl: recipe.sourceUrl
        };
        try {
          const created = await Recipe.create(formatted);
          newRecipes.push(created);
          console.log(`[SPOON] Added new recipe: ${created.title}`);
        } catch (error) {
          console.error(`[SPOON] Error creating recipe ${recipe.title}:`, error.message);
        }
      } else {
        console.log(`[SPOON] Recipe already exists: ${recipe.title}`);
      }
    }
    console.log('[SPOONACULAR] Number of new recipes added to DB:', newRecipes.length);
    console.log(`[SPOON] Inserted ${newRecipes.length} new recipes into DB`);
  return newRecipes;
  } catch (error) {
    console.error('[SPOONACULAR] Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        params: error.config?.params,
        headers: error.config?.headers
      }
    });
    throw error;
  }
}

module.exports = {
  seedRecipes,
  fetchDetailedRecipes,
  seedRandomRecipe,
  searchRecipes
};
