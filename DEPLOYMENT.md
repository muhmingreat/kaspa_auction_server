# Backend Deployment Guide

The `server` component of this application requires a persistent environment to maintain WebSocket connections and in-memory auction state. **It cannot be deployed to Vercel Serverless**.

## Recommended Host: Render.com

1.  **Push your code** to a GitHub repository.
2.  **Sign up/Login** to [Render](https://render.com).
3.  Click **New +** -> **Web Service**.
4.  Connect your GitHub repository.
5.  **Configuration**:
    - **Root Directory**: `server` (Important!)
    - **Build Command**: `npm install && npm run build`
    - **Start Command**: `npm start`
    - **Environment Variables**:
        - `PORT`: `3005` (or any port, Render will override/assign one)
        - `CORS_ORIGIN`: `*` (or your frontend URL, e.g., `https://your-frontend.vercel.app`)

## Environment Variables (Server)
Ensure you set these in your Render dashboard:
- `PORT`: `10000` (Render default)
- Any other variables from `server/.env`.

## Frontend Configuration
Once deployed, Render will give you a URL (e.g., `https://kaspa-auction-server.onrender.com`).
1.  Go to your `client` directory.
2.  Update `.env` or `.env.local`:
    ```
    NEXT_PUBLIC_SOCKET_URL=https://kaspa-auction-server.onrender.com
    ```
3.  Redeploy your Frontend to Vercel.
