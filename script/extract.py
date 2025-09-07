import argparse
from datetime import datetime
import geopandas as gpd
import os
import pandas as pd
from typing import Any, Optional

# Constants
DATA_DIR = './data'
LOG_DIR = './script/log'

# Methods
def get_static_data(verbose: bool = False) -> gpd.GeoDataFrame:
    paths = [f for f in os.listdir(DATA_DIR) if f.endswith('.geojson')]
    gdfs = []
    
    for i, path in enumerate(paths, 1):
        gdf = gpd.read_file(os.path.join(DATA_DIR, path))
        gdfs.append(gdf[['id', 'name', 'service', 'toll', 'geometry']])
        
        if verbose:
            log(f'{i}/{len(paths)} ({path})')
    
    if not gdfs:
        return gpd.GeoDataFrame(columns=['id', 'name', 'service', 'toll'], geometry='geometry')
    
    result_gdf = gpd.GeoDataFrame(
        pd.concat(gdfs, ignore_index=True)
    ).drop_duplicates(subset='id', keep='first')

    log(f'Successfully processed {len(paths)} file(s).')
    return result_gdf

def load_data(path: str) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if (('id' in gdf.columns) & ('name' in gdf.columns) & ('service' in gdf.columns) & ('toll' in gdf.columns)):
        return gdf
    else:
        return gpd.GeoDataFrame(columns=['id', 'name', 'service', 'toll'], geometry='geometry')

def log(msg: Any) -> None:
    msg_str = f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] ' + str(msg)
    print(msg_str)

    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = os.path.join(LOG_DIR, 'extract.txt')
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(msg_str + '\n')

def main(load_path: Optional[str] = None, verbose: bool = False):
    if load_path is None:
        get_static_data(verbose).to_file(os.path.join(DATA_DIR, 'realtime-lot.geojson'))
    else:
        old_data = load_data(load_path)
        new_data = get_static_data(verbose)
        result_gdf = gpd.GeoDataFrame(
            pd.concat([old_data, new_data], ignore_index=True).sort_values('id')
        ).drop_duplicates(subset='id', keep='first')
        result_gdf.to_file(os.path.join(DATA_DIR, 'realtime-lot.geojson'))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Extract static properties from GeoJSON files.')
    parser.add_argument(
        '--load-file', '-l',
        type=str,
        default=None,
        help='Loads history file.'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging.'
    )
    args = parser.parse_args()
    main(args.load_file, args.verbose)