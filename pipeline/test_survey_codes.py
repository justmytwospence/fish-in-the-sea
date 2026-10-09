import unittest
import numpy as np
import pandas as pd
from survey_codes import nsfg_valid_mask, nhanes_smoking, nhanes_degree

class ResponseTests(unittest.TestCase):
    def test_nsfg_unsure_is_not_refusal(self):
        d=pd.DataFrame(dict(RMARITAL=[3]*6,AGER=[30]*6,RWANT=[1,5,9,8,np.nan,7],HIEDUC=[8]*6,HISPRACE2=[2]*6,WGT2022_2023=[1]*6))
        self.assertEqual(nsfg_valid_mask(d).tolist(),[True,True,True,False,False,False])
        for key,value in [('AGER',50),('RMARITAL',1),('HIEDUC',98),('HISPRACE2',9),('WGT2022_2023',float('inf'))]:
            x=d.iloc[:1].copy();x[key]=value;self.assertFalse(nsfg_valid_mask(x).iloc[0])
    def test_smoking_missing_is_not_nonsmoker(self):
        d=pd.DataFrame({'SMQ020':[1,1,1,2,1,7,np.nan],'SMQ040':[1,2,3,np.nan,9,1,1]})
        result=nhanes_smoking(d)
        self.assertEqual(result.iloc[:4].tolist(),[1,1,0,0]);self.assertTrue(result.iloc[4:].isna().all())
    def test_education_missing_is_not_no_degree(self):
        result=nhanes_degree(pd.DataFrame({'DMDEDUC2':[1,5,7,9,np.nan]}))
        self.assertEqual(result.iloc[:2].tolist(),[0,1]);self.assertTrue(result.iloc[2:].isna().all())

if __name__=='__main__': unittest.main()
