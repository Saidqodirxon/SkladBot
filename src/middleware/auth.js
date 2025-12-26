/**
 * Authentication Middleware
 * Protects admin routes from unauthorized access
 */

/**
 * Check if user is authenticated
 * Redirects to login if not authenticated
 */
export function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    // User is authenticated
    return next();
  }

  // User is not authenticated, redirect to login
  res.redirect("/admin/login");
}

/**
 * Check if user is already authenticated
 * Redirects to dashboard if already logged in
 */
export function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.adminId) {
    // User is already logged in, redirect to users page
    return res.redirect("/admin/users");
  }

  // User is not logged in, continue to login page
  next();
}

/**
 * Add current admin info to response locals
 * Makes admin data available in all views
 */
export async function addAdminToLocals(req, res, next) {
  if (req.session && req.session.adminId) {
    res.locals.isAuthenticated = true;
    res.locals.adminUsername = req.session.username;
  } else {
    res.locals.isAuthenticated = false;
    res.locals.adminUsername = null;
  }

  next();
}
