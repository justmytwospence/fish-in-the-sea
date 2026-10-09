"""Checked tract allocation; county is part of a tract's identity."""
import numpy as np
import pandas as pd


def attach_pumas(tracts: pd.DataFrame, relationship: pd.DataFrame) -> pd.DataFrame:
    # Zero-population water-only tracts have reusable 99xxxx codes in CT.
    # They carry no allocation mass and are excluded before identity checks.
    tracts = tracts[tracts['pop'] > 0].copy()
    tp = relationship[~relationship.TRACTCE.str.startswith('99')].rename(columns={"STATEFP": "st", "COUNTYFP": "old_county", "TRACTCE": "tract"}).copy()
    tp["county"] = tp.st + tp.old_county
    # Connecticut changed county equivalents in 2022 without changing these
    # tract codes. Construct an explicit old->new GEOID mapping ONLY for CT,
    # and require both vintages' tract codes to be unique before using it.
    ct_old = tp[tp.st == "09"]
    ct_new = tracts[tracts.st == "09"]
    if ct_old.tract.duplicated().any() or ct_new.tract.duplicated().any():
        raise ValueError("Connecticut tract renumbering requires an external relationship crosswalk")
    ct_map = ct_new[["tract", "county"]].merge(ct_old[["tract", "PUMA5CE"]], on="tract", validate="one_to_one")
    ct_map["st"] = "09"
    mapping = pd.concat([tp[tp.st != "09"][["st", "county", "tract", "PUMA5CE"]], ct_map], ignore_index=True)
    if mapping.duplicated(["st", "county", "tract"]).any():
        raise ValueError("Duplicate tract-to-PUMA relationship")
    out = tracts.merge(mapping, on=["st", "county", "tract"], how="left", validate="one_to_one", indicator=True)
    # Puerto Rico is outside the app's scope.
    out = out[out.st != "72"].copy()
    missing = out[out._merge != "both"]
    if len(missing):
        raise ValueError(f"Unmatched tracts: {missing[['county', 'tract']].to_dict('records')[:20]}")
    assert np.isclose(out['pop'].sum(), tracts.loc[tracts.st != '72', 'pop'].sum())
    return out.drop(columns="_merge")


def check_allocations(weights: pd.DataFrame) -> None:
    if not weights.f.between(0, 1 + 1e-9).all():
        raise ValueError("Invalid PUMA market weights")
    if not np.allclose(weights.groupby("stpuma").f.sum(), 1, atol=1e-8):
        raise ValueError("Markets do not partition PUMA population")
