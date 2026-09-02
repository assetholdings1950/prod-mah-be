const asyncHandler = require("express-async-handler");

/**
 * Middleware to check if user has specific permission
 * @param {string} module - Module name (e.g., 'coins', 'members')
 * @param {string} action - Action name (e.g., 'read', 'create', 'update')
 * @returns {Function} Express middleware function
 */
const requirePermission = (module, action) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        statusCode: 401,
        message: "Authentication required",
      });
    }

    try {
      // Get user roles with permissions
      const User = require("../models/user.model");
      const Role = require("../models/roles.model");
      
      const user = await User.findById(req.user.sub).populate('role');
      
      if (!user || !user.role || !Array.isArray(user.role)) {
        return res.status(403).json({
          status: false,
          statusCode: 403,
          message: "No roles assigned to user",
        });
      }

      // Check if any role has the required permission
      const hasPermission = user.role.some(role => {
        if (!role.contents || !Array.isArray(role.contents)) {
          return false;
        }
        
        const requiredPermission = `${module}:${action}`;
        return role.contents.includes(requiredPermission);
      });

      if (!hasPermission) {
        return res.status(403).json({
          status: false,
          statusCode: 403,
          message: `Access denied. Required permission: ${module}:${action}`,
        });
      }

      // Add user permissions to request for later use
      req.userPermissions = user.role.flatMap(role => role.contents || []);
      
      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal server error during permission check",
      });
    }
  });
};

/**
 * Middleware to check if user has any permission for a module
 * @param {string} module - Module name (e.g., 'coins', 'members')
 * @returns {Function} Express middleware function
 */
const requireAnyModulePermission = (module) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        statusCode: 401,
        message: "Authentication required",
      });
    }

    try {
      const User = require("../models/user.model");
      const user = await User.findById(req.user.sub).populate('role');
      
      if (!user || !user.role || !Array.isArray(user.role)) {
        return res.status(403).json({
          status: false,
          statusCode: 403,
          message: "No roles assigned to user",
        });
      }

      // Check if any role has any permission for the module
      const hasModulePermission = user.role.some(role => {
        if (!role.contents || !Array.isArray(role.contents)) {
          return false;
        }
        
        return role.contents.some(permission => 
          permission.startsWith(`${module}:`)
        );
      });

      if (!hasModulePermission) {
        return res.status(403).json({
          status: false,
          statusCode: 403,
          message: `Access denied. No permissions for module: ${module}`,
        });
      }

      // Add user permissions to request for later use
      req.userPermissions = user.role.flatMap(role => role.contents || []);
      
      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal server error during permission check",
      });
    }
  });
};

/**
 * Middleware to check if user is employee (only dashboard access)
 * @returns {Function} Express middleware function
 */
const requireEmployeeAccess = () => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        statusCode: 401,
        message: "Authentication required",
      });
    }

    try {
      const User = require("../models/user.model");
      const user = await User.findById(req.user.sub).populate('role');
      
      if (!user || !user.role || !Array.isArray(user.role)) {
        return res.status(403).json({
          status: false,
          statusCode: 403,
          message: "No roles assigned to user",
        });
      }

      // Get all permissions
      const allPermissions = user.role.flatMap(role => role.contents || []);
      
      // Check if user only has dashboard:read permission
      const hasOnlyDashboardAccess = 
        allPermissions.length === 1 && 
        allPermissions.includes('dashboard:read');

      if (!hasOnlyDashboardAccess) {
        return res.status(403).json({
          status: false,
          statusCode: 403,
          message: "Access denied. This endpoint is for employee role only",
        });
      }

      req.userPermissions = allPermissions;
      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        status: false,
        statusCode: 500,
        message: "Internal server error during permission check",
      });
    }
  });
};

/**
 * Middleware to add user permissions to request (non-blocking)
 * @returns {Function} Express middleware function
 */
const attachUserPermissions = () => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    try {
      const User = require("../models/user.model");
      const user = await User.findById(req.user.sub).populate('role');
      
      if (user && user.role && Array.isArray(user.role)) {
        req.userPermissions = user.role.flatMap(role => role.contents || []);
      }
      
      next();
    } catch (error) {
      console.error("Error attaching permissions:", error);
      next(); // Continue without permissions on error
    }
  });
};

module.exports = {
  requirePermission,
  requireAnyModulePermission,
  requireEmployeeAccess,
  attachUserPermissions,
};
