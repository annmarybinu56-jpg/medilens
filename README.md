# 🧬 MediLens – Node.js Setup Guide

## 1. Prerequisites
- **Node.js** (v14+)
- **npm** (v6+)

## 2. Installation
Open your terminal in the project directory and run:
`npm install`

## 3. Configuration
- Update your Firebase keys in `public/index.html`.
- Modify `.env` if you'd like to change the server's port.

## 4. Running the App
For development (uses **nodemon** to auto-restart):
`npm run dev`

For production:
`npm start`

## 📝 Project Details
- Uses **Express.js** as the backend framework.
- Serves static assets from the `/public` folder.
- Ready for expanded API routes in `server.js` for prescriptions/profiles.
