import { Router } from 'express';
import { registerUser, loginUser, logoutUser, getCurrentUser, updateUserProfile, getAllUsers } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { rateLimiter } from '../middlewares/rateLimitMiddleware.js';

const router = Router();

/**
 * @openapi
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     description: Creates a fresh user account with bcrypt hashing and dynamically generates a profile initials avatar.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: token=abc...; HttpOnly; Path=/; Max-Age=604800
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Account created successfully!" }
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid input parameters or email already registered
 *       500:
 *         description: Internal server error
 */
router.post('/signup', rateLimiter(15 * 60 * 1000, 15, 'Too many registration attempts from this IP. Please try again after 15 minutes.'), registerUser);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in an existing user
 *     description: Authenticates user credentials, generates JWT signature, and returns secure HttpOnly cookie.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: User authenticated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid email or password format
 *       401:
 *         description: Authentication failed (incorrect password or user does not exist)
 */
router.post('/login', rateLimiter(15 * 60 * 1000, 30, 'Too many login attempts from this IP. Please try again after 15 minutes.'), loginUser);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Log out the active session
 *     description: Protected route. Clears the HttpOnly JWT session cookie and updates status in PostgreSQL.
 *     tags:
 *       - Authentication
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User logged out successfully
 *       401:
 *         description: Unauthorized (no token provided or token invalid)
 */
router.post('/logout', protect, logoutUser);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Retrieve current authenticated user profile
 *     description: Protected route. Parses active session claims and returns user record from PostgreSQL.
 *     tags:
 *       - Authentication
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Profile successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Unauthorized
 */
router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateUserProfile);
router.get('/users', protect, getAllUsers);

export default router;
