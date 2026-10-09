"""Survey-specific valid response handling, independent of downloaded files."""
import numpy as np
import pandas as pd


def nsfg_valid_mask(d):
    return (d.RMARITAL.isin([3,4,5,6]) & d.AGER.between(18,49) & d.RWANT.isin([1,5,9])
            & d.HIEDUC.between(1,11) & d.HISPRACE2.isin([1,2,3,4])
            & (d.WGT2022_2023>0) & np.isfinite(d.WGT2022_2023))


def nhanes_smoking(d):
    valid=d.SMQ020.isin([1,2]) & ((d.SMQ020==2) | d.SMQ040.isin([1,2,3]))
    smoking=(d.SMQ020==1) & d.SMQ040.isin([1,2])
    return pd.Series(np.where(valid,smoking.astype(float),np.nan),index=d.index)


def nhanes_degree(d):
    return pd.Series(np.where(d.DMDEDUC2.isin([1,2,3,4,5]),(d.DMDEDUC2==5).astype(float),np.nan),index=d.index)
