const ROLE_HIERARCHY = { viewer: 0, editor: 1, super_admin: 2 };

/**
 * Require at minimum the given role.
 * E.g. requireRole('editor') allows editor and super_admin.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userLevel = ROLE_HIERARCHY[req.user.role] ?? -1;
    const allowed = roles.some(r => userLevel >= (ROLE_HIERARCHY[r] ?? 999));
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireRole };
