"""Conditional contrast against alternatives sampled from a common baseline."""
import numpy as np
from scipy.optimize import minimize


def loss(beta, X, w):
    u = X @ beta
    u -= u.max(1, keepdims=True)
    return np.log(np.exp(u).sum(1)) - u[:, 0]


def fit_contrast(X, w, ridge=1.0):
    w = w / w.mean()
    G, _, F = X.shape
    def objective(beta):
        u = X @ beta
        u -= u.max(1, keepdims=True)
        e = np.exp(u)
        p = e / e.sum(1, keepdims=True)
        ll = (w * (u[:, 0] - np.log(e.sum(1)))).sum()
        grad = (w[:, None] * (X[:, 0, :] - np.einsum('gk,gkf->gf', p, X))).sum(0)
        return -ll / G + ridge * beta @ beta / G, -grad / G + 2 * ridge * beta / G
    res = minimize(objective, np.zeros(F), jac=True, method='L-BFGS-B', options={'maxiter':1000})
    if not res.success or not np.isfinite(res.x).all():
        raise ValueError(f'Pairing fit did not converge: {res.message}')
    return res.x
