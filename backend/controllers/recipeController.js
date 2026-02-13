const Recipe = require('../models/Recipe');
const recipeService = require('../services/recipeService');
const spoonacularService = require('../services/spoonacularService');

/**
 * Filter recipes by user preferences. Used to pull unique matches from DB only.
 * @param {Array} recipes - Mongoose recipe documents
 * @param {Object} opts - { cuisineTypes, dietaryRestrictions, cookTimeCategory }
 * @returns {Array} filtered recipes (unique by _id)
 */
function filterRecipesByPreferences(recipes, opts) {
  const cuisineTypes = (opts.cuisineTypes || []).map(c => c.toLowerCase());
  const dietaryRestrictions = (opts.dietaryRestrictions || []).map(d => d.toLowerCase());
  let minCook = null, maxCook = null;
  if (opts.cookTimeCategory === 'Hangry') {
    maxCook = 20;
  } else if (opts.cookTimeCategory === 'Hungry') {
    minCook = 21;
    maxCook = 40;
  }

  const filtered = recipes.filter(r => {
    if (cuisineTypes.length) {
      const recipeCuisine = (r.cuisine || '').toLowerCase();
      const recipeTags = (r.tags || []).map(t => t.toLowerCase());
      const hasMatchingCuisine = cuisineTypes.some(cuisine =>
        recipeCuisine.includes(cuisine) || recipeTags.some(tag => tag.includes(cuisine))
      );
      if (!hasMatchingCuisine) return false;
    }
    if (dietaryRestrictions.length &&
      !dietaryRestrictions.every(dr => {
        const tagsLower = (r.tags || []).map(t => t.toLowerCase());
        return tagsLower.some(tag => tag.includes(dr));
      })
    ) return false;
    // Cook time: if recipe has no cookingTime, allow it; otherwise apply range
    if (r.cookingTime != null) {
      if (minCook != null && maxCook != null && (r.cookingTime < minCook || r.cookingTime > maxCook)) return false;
      if (minCook == null && maxCook != null && r.cookingTime > maxCook) return false;
      if (minCook != null && maxCook == null && r.cookingTime < minCook) return false;
    }
    return true;
  });

  // Return unique by _id (in case of any duplicate refs)
  const seen = new Set();
  return filtered.filter(r => {
    const id = r._id?.toString();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

exports.list = async (req, res) => {
  try {
    const recipes = await recipeService.listRecipes();
    res.json(Array.isArray(recipes) ? recipes : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.filter = async (req, res) => {
  try {
    const recipes = await recipeService.filterRecipes(req.query);
    res.json(Array.isArray(recipes) ? recipes : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const recipe = await recipeService.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const recipe = await recipeService.createRecipe(req.body);
    res.status(201).json({ message: 'Recipe created', recipe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const recipe = await recipeService.updateRecipe(req.params.id, req.body);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ message: 'Recipe updated', recipe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const recipe = await recipeService.deleteRecipe(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ message: 'Recipe deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.seedRandom = async (req, res) => {
  try {
    const recipe = await recipeService.seedRandomRecipe();
    res.status(201).json({ message: 'Random recipe seeded successfully', recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Discover recipes: filter recipes stored in the DB by user preferences; only call Spoonacular if no matches.
exports.discover = async (req, res) => {
  try {
    let { cuisineTypes = [], dietaryRestrictions = [], cookTimeCategory, cookingTime } = req.body;
    if (!cookTimeCategory && cookingTime) cookTimeCategory = cookingTime;
    if (dietaryRestrictions.length === 1 && ['no-restrictions', 'none', ''].includes((dietaryRestrictions[0] || '').toLowerCase())) {
      dietaryRestrictions = [];
    }
    console.log('[DISCOVER] Request:', { cuisineTypes: cuisineTypes?.length, dietaryRestrictions: dietaryRestrictions?.length, cookTimeCategory });

    const allRecipes = await Recipe.find();
    console.log(`[DISCOVER] Total recipes in DB: ${allRecipes.length}`);

    let recipes = filterRecipesByPreferences(allRecipes, {
      cuisineTypes: cuisineTypes || [],
      dietaryRestrictions: dietaryRestrictions || [],
      cookTimeCategory
    });
    console.log(`[DISCOVER] After filter (DB only): ${recipes.length} unique recipes`);

    // Only call Spoonacular when we have zero matches (to grow the DB; otherwise use stored recipes only)
    if (recipes.length === 0) {
      try {
        console.log('[DISCOVER] No matches in DB, calling Spoonacular...');
        await spoonacularService.searchRecipes({ cuisineTypes, dietaryRestrictions, cookTimeCategory, minServings: req.body.minServings });
        const updated = await Recipe.find();
        recipes = filterRecipesByPreferences(updated, {
          cuisineTypes: cuisineTypes || [],
          dietaryRestrictions: dietaryRestrictions || [],
          cookTimeCategory
        });
        console.log(`[DISCOVER] After Spoonacular + filter: ${recipes.length} unique recipes`);
      } catch (spoonacularError) {
        console.error('[DISCOVER] Spoonacular fetch failed:', spoonacularError.message);
      }
    }

    res.json({ recipes: Array.isArray(recipes) ? recipes : [] });
  } catch (err) {
    console.error('[DISCOVER] Error:', err);
    res.status(500).json({ error: err.message });
  }
}; 