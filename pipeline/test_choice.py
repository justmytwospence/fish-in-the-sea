import unittest
import numpy as np
from choice_math import fit_contrast

class ChoiceTests(unittest.TestCase):
    def test_known_association_with_unequal_baseline(self):
        rng=np.random.default_rng(81)
        baseline=np.array([.75,.25])
        beta=.8
        partner=baseline*np.exp(np.array([0,beta]));partner/=partner.sum()
        chosen=rng.choice(2,12000,p=partner)
        controls=rng.choice(2,(12000,15),p=baseline)
        X=np.concatenate([chosen[:,None],controls],axis=1)[...,None].astype(float)
        fitted=fit_contrast(X,np.ones(len(X)),ridge=1)[0]
        self.assertAlmostEqual(fitted,beta,delta=.1)

if __name__=='__main__': unittest.main()
