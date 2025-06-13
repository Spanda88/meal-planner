import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChefHat, ArrowRight, ArrowLeft } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth0 } from '@auth0/auth0-react';
import CuisinePreferences from "@/components/onboarding/CuisinePreferences";
import DietaryRestrictions from "@/components/onboarding/DietaryRestrictions";
import CookingTime from "@/components/onboarding/CookingTime";
import ServingSize from "@/components/onboarding/ServingSize";
import { uiToSpoonacularCuisines } from "@/utils/cuisineMapping";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [preferences, setPreferences] = useState({
    cuisinePreferences: [] as string[],
    dietaryRestrictions: [] as string[],
    cookingTime: "",
    servingSize: 2
  });
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const authError = params.get("error_description");
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently, error } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect({
        appState: { returnTo: '/onboarding' },
        authorizationParams: {
          screen_hint: 'signup',
          prompt: 'login'
        }
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // This will trigger the useEffect to redirect
  }

  const totalSteps = 4;
  const stepTitles = ["Cuisine Preferences", "Dietary Restrictions", "Cooking Time", "Serving Size"];

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return preferences.cuisinePreferences.length > 0;
      case 2:
        return preferences.dietaryRestrictions.length > 0;
      case 3:
        return preferences.cookingTime !== "";
      case 4:
        return preferences.servingSize >= 1 && preferences.servingSize <= 8;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      try {
        const token = await getAccessTokenSilently();
        console.log("[ONBOARDING] Got Auth0 token:", token);
        const spoonacularCuisines = uiToSpoonacularCuisines(preferences.cuisinePreferences);
        const preferencesPayload = {
          ...preferences,
          cuisineTypes: spoonacularCuisines
        };
        console.log("[ONBOARDING] Saving preferences to backend:", preferencesPayload);
        const prefRes = await fetch(`${API_URL}/api/users/preferences`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ preferences: preferencesPayload })
        });
        const prefResJson = await prefRes.json().catch(() => ({}));
        console.log(`[ONBOARDING] Preferences PUT response (${prefRes.status}):`, prefResJson);
        // Make recipe discovery API call with converted cuisines
        const response = await fetch(`${API_URL}/api/recipes/discover`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            cuisineTypes: spoonacularCuisines,
            ...(preferences.dietaryRestrictions.length > 0 && {
              dietaryRestrictions: preferences.dietaryRestrictions.filter(d => d !== 'no-restrictions')
            }),
            cookTimeCategory: preferences.cookingTime,
            minServings: preferences.servingSize
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const recipesJson = await response.json();
        navigate('/recipes', { state: { recipes: recipesJson } });
      } catch (error) {
        console.error('[ONBOARDING] Error during onboarding flow:', error);
        // For now, just navigate to recipes page even if the API call fails
        navigate('/recipes');
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updatePreferences = <T extends keyof typeof preferences>(
    key: T,
    value: typeof preferences[T]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <CuisinePreferences 
            selected={preferences.cuisinePreferences} 
            onUpdate={(value) => updatePreferences('cuisinePreferences', value)} 
          />
        );
      case 2:
        return (
          <DietaryRestrictions 
            selected={preferences.dietaryRestrictions} 
            onUpdate={(value) => updatePreferences('dietaryRestrictions', value)} 
          />
        );
      case 3:
        return (
          <CookingTime 
            selected={preferences.cookingTime} 
            onUpdate={(value) => updatePreferences('cookingTime', value)} 
          />
        );
      case 4:
        return (
          <ServingSize 
            selected={preferences.servingSize} 
            onUpdate={(value) => updatePreferences('servingSize', value)} 
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-4">
          {(authError || error) && (
            <div className="mb-4">
              {authError && (
                <div className="text-red-600 text-center mb-2">{authError}</div>
              )}
              {error && (
                <div className="text-red-600 text-center mb-2">{error.message || "Authentication error. Please try again."}</div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center text-gray-600 hover:text-emerald-600 transition-colors">
              <ArrowLeft className="w-5 h-5 mr-1" />
              Back
            </Link>
            <div className="flex-1 flex justify-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <ChefHat className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="w-16"></div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {stepTitles[currentStep - 1]}
            </CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              Step {currentStep} of {totalSteps} - Help us personalize your meal planning experience
            </CardDescription>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-emerald-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            ></div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {renderStep()}
          
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center disabled:opacity-50"
            >
              {currentStep === totalSteps ? "Find Recipes" : "Next"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
