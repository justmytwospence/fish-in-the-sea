import unittest
import pandas as pd
from geography import attach_pumas, check_allocations

class GeographyTests(unittest.TestCase):
    def test_repeated_tract_codes_do_not_cross_counties(self):
        tr = pd.DataFrame({'st':['06','06'], 'county':['06001','06003'], 'tract':['000100','000100'], 'pop':[10,20]})
        tp = pd.DataFrame({'STATEFP':['06','06'], 'COUNTYFP':['001','003'], 'TRACTCE':['000100','000100'], 'PUMA5CE':['00100','00300']})
        out = attach_pumas(tr, tp)
        self.assertEqual(out.PUMA5CE.tolist(), ['00100','00300'])
        self.assertEqual(out['pop'].sum(), 30)
    def test_ct_county_vintage_mapping(self):
        tr = pd.DataFrame({'st':['09'], 'county':['09110'], 'tract':['010101'], 'pop':[12]})
        tp = pd.DataFrame({'STATEFP':['09'], 'COUNTYFP':['001'], 'TRACTCE':['010101'], 'PUMA5CE':['20901']})
        self.assertEqual(attach_pumas(tr,tp).PUMA5CE.tolist(), ['20901'])
    def test_missing_tract_fails(self):
        tr = pd.DataFrame({'st':['06'], 'county':['06001'], 'tract':['000100'], 'pop':[10]})
        tp = pd.DataFrame({'STATEFP':['06'], 'COUNTYFP':['003'], 'TRACTCE':['000100'], 'PUMA5CE':['00300']})
        with self.assertRaises(ValueError): attach_pumas(tr,tp)
    def test_allocations_partition(self):
        check_allocations(pd.DataFrame({'stpuma':[1,1], 'f':[.4,.6]}))
        with self.assertRaises(ValueError): check_allocations(pd.DataFrame({'stpuma':[1,1], 'f':[.4,.8]}))

if __name__ == '__main__': unittest.main()
