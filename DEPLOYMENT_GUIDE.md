# PINIT Vault - Production Deployment Guide

## 🚀 Deployment Overview

This guide covers deploying the PINIT Vault application to production:
- **Backend**: Render (Python FastAPI)
- **Frontend**: Vercel (React + Vite)

## 📋 Prerequisites

### Required Accounts
- [Render Account](https://render.com/) (Free tier available)
- [Vercel Account](https://vercel.com/) (Free tier available)
- [Supabase Account](https://supabase.com/) (Database)

### Required Tools
- Git installed and configured
- Node.js 18+ installed
- Python 3.9+ installed

---

## 🗄️ Backend Deployment (Render)

### 1. Prepare Backend Repository

```bash
# Ensure backend is clean
cd backend
git status
git add .
git commit -m "Ready for production deployment"
```

### 2. Configure Environment Variables

Create `backend/.env` with:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-key
JWT_SECRET=your-secure-jwt-secret-key
JWT_EXPIRE_MINUTES=60
RP_ID=your-domain.onrender.com
RP_NAME=PINIT Vault
DEBUG=false
```

### 3. Deploy to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. **Build Settings**:
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

5. **Environment Variables** (Add all from `.env` above)

6. **Advanced Settings**:
   - **Health Check Path**: `/`
   - **Auto-Deploy**: Enabled

7. Click "Create Web Service"

### 4. Verify Backend Deployment

Once deployed, your backend will be available at:
`https://your-service-name.onrender.com`

Test it:
```bash
curl https://your-service-name.onrender.com/
```

---

## 🌐 Frontend Deployment (Vercel)

### 1. Prepare Frontend Repository

```bash
cd frontend
npm install
npm run build
```

### 2. Configure Environment Variables

Create `frontend/.env.production`:
```env
VITE_API_URL=https://your-backend-name.onrender.com
NODE_ENV=production
```

### 3. Deploy to Vercel

#### Option A: Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from frontend directory
cd frontend
vercel --prod
```

#### Option B: Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Connect your GitHub repository
4. **Build Settings**:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. **Environment Variables**:
   - `VITE_API_URL`: `https://your-backend-name.onrender.com`

6. Click "Deploy"

### 4. Verify Frontend Deployment

Your frontend will be available at:
`https://your-project-name.vercel.app`

---

## 🔧 Post-Deployment Configuration

### 1. Update CORS Settings

In `backend/main.py`, update the CORS origins:
```python
allow_origins=[
    # Add your actual Vercel domain
    "https://your-project-name.vercel.app",
    "https://*.vercel.app",
    # Keep local development origins
    "http://localhost:8080",
    "*"
]
```

### 2. Update Frontend API URL

In `frontend/.env.production`:
```env
VITE_API_URL=https://your-backend-name.onrender.com
```

### 3. Redeploy Both Services

After CORS updates, redeploy:
- Backend: Push changes to GitHub (Render auto-deploys)
- Frontend: `vercel --prod` (or Vercel dashboard)

---

## ✅ Pre-Deployment Checklist

### Backend Checklist
- [ ] `requirements.txt` contains all dependencies
- [ ] `.env.example` provided with all required variables
- [ ] `render.yaml` configured correctly
- [ ] CORS allows production domains
- [ ] Health check endpoint works
- [ ] Database connection configured
- [ ] JWT secret is secure
- [ ] Debug mode disabled in production

### Frontend Checklist
- [ ] `npm run build` succeeds without errors
- [ ] `vercel.json` configured correctly
- [ ] Environment variables set for production
- [ ] API URL points to production backend
- [ ] All routes work with client-side routing
- [ ] No console errors in production build
- [ ] Images and static assets load correctly

### Testing Checklist
- [ ] Backend starts successfully (`/` returns 200)
- [ ] Frontend builds and serves correctly
- [ ] API endpoints accessible from frontend
- [ ] Authentication flow works
- [ ] File upload functionality works
- [ ] Camera capture works
- [ ] Portfolio sharing works
- [ ] All pages load without errors

---

## 🚨 Common Issues & Solutions

### Issue 1: CORS Errors
**Problem**: Frontend can't access backend API
**Solution**: 
1. Add your Vercel domain to `backend/main.py` CORS origins
2. Redeploy backend
3. Clear browser cache

### Issue 2: Build Failures
**Problem**: Frontend build fails with TypeScript errors
**Solution**:
1. Run `npm run build` locally first
2. Fix any TypeScript errors
3. Check for missing dependencies

### Issue 3: Environment Variables Not Loading
**Problem**: API calls failing with wrong URLs
**Solution**:
1. Verify `VITE_API_URL` is set correctly
2. Ensure variables are prefixed with `VITE_`
3. Redeploy frontend after changes

### Issue 4: Database Connection Issues
**Problem**: Backend can't connect to Supabase
**Solution**:
1. Verify Supabase URL and keys
2. Check network connectivity
3. Ensure Supabase project is active

### Issue 5: Slow Performance
**Problem**: Application loads slowly
**Solution**:
1. Optimize images and assets
2. Implement code splitting
3. Use CDN for static assets

---

## 🔄 CI/CD Pipeline

### Automatic Deployments

**Backend (Render)**:
- Auto-deploys on push to main branch
- Uses `render.yaml` configuration
- Environment variables managed in Render dashboard

**Frontend (Vercel)**:
- Auto-deploys on push to main branch
- Uses `vercel.json` configuration
- Environment variables managed in Vercel dashboard

### Manual Deployments

**Backend**:
```bash
git push origin main  # Triggers Render auto-deploy
```

**Frontend**:
```bash
cd frontend
vercel --prod  # Manual production deploy
```

---

## 📊 Monitoring & Maintenance

### Backend Monitoring (Render)
- Check Render dashboard for service health
- Monitor error logs and performance metrics
- Set up alerts for downtime

### Frontend Monitoring (Vercel)
- Check Vercel analytics for performance
- Monitor build logs and deployment status
- Set up custom domains if needed

### Database Monitoring (Supabase)
- Monitor database usage and performance
- Check API quota and limits
- Set up backups and security

---

## 🛠️ Local Development Setup

After deployment, maintain local development:

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

---

## 📞 Support & Troubleshooting

### Debug Information
For deployment issues, provide:
1. Service URLs (backend and frontend)
2. Error messages from logs
3. Environment variables (sanitized)
4. Build logs
5. Browser console errors

### Useful Commands
```bash
# Backend health check
curl https://your-backend.onrender.com/

# Frontend build test
cd frontend && npm run build

# Check environment variables
vercel env ls  # Frontend
# Check Render dashboard for backend env vars
```

---

## 🎉 Success!

Your PINIT Vault application is now deployed and ready for production use!

**Backend**: `https://your-backend-name.onrender.com`  
**Frontend**: `https://your-project-name.vercel.app`

For any issues, refer to the troubleshooting section or check the service logs.
