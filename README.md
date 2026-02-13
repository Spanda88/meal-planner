# meal-planner
CMU capstone project: Automated meal planner and grocery list

# Local / demo setup

## Set-up Instructions
The env files with demo keys are committed as **examples**. One-time setup:

1. **Backend**
   - `cp backend/.env.example backend/.env`
2. **Frontend**
   - `cp frontend/.env.local.example frontend/.env.local`
3. **MongoDB** – ensure MongoDB is running locally (e.g. `mongodb://127.0.0.1:27017`).
4. **Run**
   - Backend: `cd backend && npm install && npm run dev`
   - Frontend: `cd frontend && npm install && npm run dev`
   - Open http://localhost:8080 (or the port Vite prints).
5. **Optional – seed recipes**: `cd backend && npm run seed:general`

(For production, use your own Auth0 tenant and Spoonacular API key; do not commit real `.env`.)

## References
Web App Demo: https://youtu.be/eyBAlUeGDzY

Software Documentation: https://spanda.bitdocs.ai/share/d/25Ej0100zygYhPKp
