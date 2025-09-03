import argparse
from bs4 import BeautifulSoup, Tag
from dataclasses import dataclass
from datetime import datetime, timedelta
from json import dump
import os
import requests
import shapely
from time import sleep
from typing import Any, Optional

# Constants
BASEURL = 'https://itaipeiparking.pma.gov.taipei/'
URL = 'https://itaipeiparking.pma.gov.taipei/w1/GetParks/{long}/{lat}/car/5'
BASEHEADER = {'Accept': 'text/html;charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'}
HEADER = {'Accept': 'application/json;charset=utf-8',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US',
          'Cache-Control': 'no-cache',
          'Origin': 'https://itaipeiparking.pma.gov.taipei/',
          'Pragma': 'no-cache',
          'Priority': 'u=1, i',
          'Referer': 'https://itaipeiparking.pma.gov.taipei/',
          'Sec-Ch-Ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'}

GROUP_1 = [(121.468, 25.125), (121.476, 25.133), (121.484, 25.141), (121.5, 25.141), (121.492, 25.133), (121.516, 25.141), (121.5, 25.125), (121.516, 25.109), (121.532, 25.125), (121.548, 25.141), (121.492, 25.149), (121.508, 25.133), (121.524, 25.149), (121.548, 25.157), (121.524, 25.133), (121.508, 25.117), (121.524, 25.117), (121.532, 25.109), (121.54, 25.117), (121.508, 25.149), (121.54, 25.133), (121.516, 25.125), (121.468, 25.109), (121.5, 25.109), (121.524, 25.101), (121.54, 25.101), (121.548, 25.109), (121.556, 25.117), (121.556, 25.101), (121.582, 25.118), (121.564, 25.109), (121.508, 25.101), (121.492, 25.101)]
GROUP_2 = [(121.532, 25.093), (121.508, 25.085), (121.516, 25.093), (121.5, 25.093), (121.548, 25.093), (121.524, 25.085), (121.516, 25.077), (121.508, 25.069), (121.524, 25.069), (121.516, 25.061), (121.508, 25.053), (121.524, 25.053), (121.516, 25.045), (121.508, 25.037), (121.524, 25.037), (121.492, 25.037), (121.5, 25.045), (121.556, 25.085), (121.564, 25.093), (121.532, 25.061), (121.54, 25.069), (121.532, 25.077), (121.54, 25.085), (121.548, 25.077), (121.548, 25.061), (121.54, 25.053), (121.532, 25.045), (121.548, 25.045), (121.54, 25.037), (121.564, 25.077), (121.556, 25.053), (121.556, 25.069), (121.556, 25.037)]
GROUP_3 = [(121.516, 25.029), (121.508, 25.021), (121.524, 25.021), (121.548, 25.013), (121.5, 25.013), (121.5, 25.029), (121.484, 25.029), (121.492, 25.021), (121.532, 25.029), (121.548, 25.029), (121.54, 25.021), (121.532, 25.013), (121.54, 25.005), (121.532, 24.997), (121.54, 24.989), (121.548, 24.997), (121.548, 24.981), (121.556, 25.005), (121.556, 24.989), (121.556, 24.973), (121.564, 25.013), (121.564, 24.997), (121.564, 24.981), (121.572, 25.005), (121.572, 24.989), (121.58, 24.997), (121.58, 24.981), (121.588, 25.005), (121.588, 24.989), (121.588, 24.973), (121.596, 24.997), (121.556, 25.021), (121.58, 25.013)]
GROUP_4 = [(121.572, 25.021), (121.564, 25.029), (121.58, 25.029), (121.564, 25.045), (121.564, 25.061), (121.572, 25.037), (121.572, 25.053), (121.58, 25.045), (121.572, 25.069), (121.572, 25.085), (121.58, 25.077), (121.58, 25.061), (121.588, 25.069), (121.588, 25.085), (121.588, 25.053), (121.588, 25.037), (121.58, 25.093), (121.596, 25.077), (121.596, 25.061), (121.596, 25.045), (121.604, 25.053), (121.604, 25.069), (121.604, 25.085), (121.612, 25.077), (121.612, 25.061), (121.612, 25.045), (121.604, 25.037), (121.62, 25.037), (121.62, 25.053), (121.62, 25.069), (121.596, 25.093), (121.628, 25.077), (121.612, 25.029)]

SEARCH_BOUND = 'POLYGON ((121.460502 25.121926, 121.463677 25.108015, 121.489634 25.097786, 121.506113 25.07742, 121.503074 25.052199, 121.484448 25.034081, 121.492259 25.010904, 121.49904 25.010281, 121.510112 25.020937, 121.519811 25.018915, 121.53423 25.002192, 121.533544 24.996591, 121.537578 24.992079, 121.536204 24.989512, 121.538608 24.987722, 121.544787 24.987178, 121.544702 24.983833, 121.548049 24.983132, 121.551568 24.984922, 121.551482 24.986789, 121.554143 24.984066, 121.552856 24.979476, 121.554572 24.976052, 121.559979 24.97683, 121.588218 24.98321, 121.590793 24.987878, 121.588304 25.001492, 121.577661 25.015182, 121.576459 25.025759, 121.595084 25.036725, 121.614396 25.032292, 121.624524 25.039135, 121.617143 25.049633, 121.625125 25.05562, 121.617143 25.06394, 121.621005 25.070159, 121.624438 25.080033, 121.601522 25.091926, 121.586244 25.089827, 121.575858 25.088273, 121.557834 25.093014, 121.559293 25.111279, 121.542556 25.109803, 121.536805 25.130086, 121.518781 25.129309, 121.512343 25.134437, 121.519038 25.14213, 121.505305 25.147335, 121.494577 25.15021, 121.475436 25.141974, 121.466081 25.132106, 121.460502 25.121926))'
search_geometry = shapely.from_wkt(SEARCH_BOUND, on_invalid='ignore')
assert isinstance(search_geometry, shapely.Polygon)

SPACING = 0.5
XSTEP = 0.004
YSTEP = 0.0035

# Custom structures
@dataclass
class Lot:
    '''
    The container to store the parking lot information.
    '''

    id: Optional[str]
    '''
    The id of the parking lot.
    '''

    name: Optional[str]
    '''
    The name of the parking lot.
    '''

    occupied: bool
    '''
    Whether the parking lot is occupied.
    '''

    service: Optional[str]
    '''
    The service hour of the parking lot.
    '''

    shape: shapely.Polygon | None
    '''
    The shape of the parking lot.
    '''

    timestamp: datetime
    '''
    The timestamp.
    '''

    toll: Optional[int]
    '''
    The toll per hour of the parking lot. 
    '''

    def __repr__(self: 'Lot') -> str:
        return f'Lot({self.id}, {self.occupied}, {self.service}, {self.toll})'

class LotCollection:
    '''
    The container of parking lots.
    '''

    lots: dict[str, Lot] = dict()
    '''
    The dictionary of parking lots, where the id is the key.
    '''

    timestamp: datetime
    '''
    The time when the result was obtained.
    '''

    def __init__(self: 'LotCollection', t: datetime | None = None) -> None:
        self.timestamp = datetime.now() if t is None else t
    
    def append(self: 'LotCollection', lot: Lot) -> None:
        '''
        Append a parking lot to the lot collection.
        '''
        if (lot.id is None):
            return
        existing = self.lots.get(lot.id)
        if (existing is None):
            self.lots[lot.id] = lot
        elif (lot.timestamp > existing.timestamp):
            self.lots[lot.id] = lot
    
    def merge(self: 'LotCollection', other: 'LotCollection', inplace: bool = False) -> 'LotCollection':
        '''
        Merge two LotCollections into a new one.
        For duplicate lots (same id), keep the one with the latest lot.timestamp.
        The new collection's timestamp is the later of the two collections.

        Parameters
        ----------
        other : LotCollection
            The other LotCollection to merge.
        inplace : bool, default False
            If True, merge into the current collection and return self.
            If False, create and return a new LotCollection.
        '''
        if inplace:
            self.timestamp = max(self.timestamp, other.timestamp)

            for lot in other.lots.values():
                self.append(lot)

            return self
        else:
            merged = LotCollection()
            merged.timestamp = max(self.timestamp, other.timestamp)

            for lot in self.lots.values():
                merged.append(lot)

            for lot in other.lots.values():
                merged.append(lot)

            return merged

    def to_geojson_file(self: 'LotCollection', path: str) -> None:
        '''
        Convert the collection to a GeoJSON file.

        Parameter
        -------
        path: str
            The path to the output file.
        '''
        features = []
        for lot in self.lots.values():
            if lot.shape is None:
                continue

            feature = {
                'type': 'Feature',
                'geometry': shapely.geometry.mapping(lot.shape),
                'properties': {
                    'id': lot.id,
                    'name': lot.name,
                    'service': lot.service,
                    'timestamp': lot.timestamp.isoformat(),
                    'toll': lot.toll,
                    'occupied': lot.occupied
                }
            }
            features.append(feature)

        geojson = {'type': 'FeatureCollection',
                   'features': features,
                   'timestamp': self.timestamp.isoformat()}
        with open(path, 'w', encoding='utf-8') as f:
            dump(geojson, f, ensure_ascii=False, indent=2)

        return 

# Methods
def get_bbox_info() -> tuple[float, float, int, int]:
    minx, miny, maxx, maxy = search_geometry.bounds
    return (minx, miny, int((maxx - minx) // XSTEP) + 1, int((maxy - miny) // YSTEP) + 1)

def get_parking_status_around_taipei(s: requests.Session, group: int = 0, verbose: bool = True) -> LotCollection:
    '''
    Retrieve the parking lot status around Taipei.
    '''
    lots = LotCollection(datetime.now())
    count = 0
    if (group == 0):
        x0, y0, x_step_count, y_step_count = get_bbox_info()
        for dx in range(x_step_count + 1):
            for dy in range(y_step_count + 1):
                point = shapely.Point(x0 + dx * XSTEP, y0 + dy * YSTEP)
                if (search_geometry.contains(point)):
                    count += 1
                    if (verbose):
                        log(f'Collecting... [{count}/1004]', group)
                    
                    try:
                        sub_lots = get_parking_status_at(s, point.x, point.y)
                        lots = lots.merge(sub_lots)
                    except:
                        log(f'Failed at ({point.x}, {point.y}).', group)

                    sleep(SPACING)
    else:
        coords: list[tuple[float, float]]
        match group:
            case 1:
                coords = GROUP_1
            case 2:
                coords = GROUP_2
            case 3:
                coords = GROUP_3
            case 4:
                coords = GROUP_4
            case _:
                coords = []
        
        for px, py in coords:
            count += 1
            if (verbose):
                log(f'Collecting... [{count}/{len(coords)}]', group)
            try:
                sub_lots = get_parking_status_at(s, px, py)
                lots = lots.merge(sub_lots)
            except:
                log(f'Failed at ({px}, {py}).', group)
            sleep(SPACING)

    log(f'Completed collecting {len(lots.lots)} parking lots.', group)
    return lots

def get_parking_status_at(s: requests.Session, lon: float, lat: float, **kwargs) -> LotCollection:
    retry = 0

    if 'retry' in kwargs:
        retry_param = kwargs.get('retry')
        if (not isinstance(retry_param, int)):
            pass
        elif (retry_param <= 0):
            pass
        else:
            retry = retry_param

    raw = s.get(URL.format(long=lon, lat=lat))
    if (not raw.ok):
        log(f'Failed to fetch the API [Attempt {retry + 1}]. ({raw.status_code}, {raw.reason})')
        if (not retry_api_call(s, lon, lat, retry)):
            return LotCollection()
    
    json = raw.json()
    if (not isinstance(json, list)):
        log(f'Failed to get a valid JSON [Attempt {retry + 1}].')
        if (not retry_api_call(s, lon, lat, retry)):
            return LotCollection()
    
    dt = datetime.now()
    lots = LotCollection(dt)
    for lot in json:
        if (isinstance(lot, dict)):
            lots.append(parse_lot_info(lot, dt))

    return lots

def handshake(s: requests.Session, group: int = 0, verbose: bool = False) -> bool:
    '''
    Perform the handshake to make sure the API interface is accessible.

    Parameter
    -------
    s: requests.Session
        The session that is going to call the API.
    
    verbose: bool, default False
        Whether to enable the verbose logging.
    
    Returns
    -------
    result: bool
        `True` if the handshake was success, and `False` if it failed.
    '''
    if (verbose):
        log('Start the handshake...', group)
    raw = s.get(BASEURL, headers=BASEHEADER)

    # Test 1: the base website
    if (not raw.ok):
        log(f'Failed test 1-1: Error when setting up connection. (status code: {raw.status_code} - {raw.reason})', group)
        return False
    bs = BeautifulSoup(raw.text, 'html.parser')
    if (not isinstance(bs.title, Tag)):
        log(f'Failed test 1-2: There\'s no title tag.', group)
        return False
    elif ('北市好停車' not in bs.title.text):
        log(f'Failed test 1-3: Possibly invalid website.', group)
        return False
    token_tag = bs.select_one('input[name="__RequestVerificationToken"]')
    if (not isinstance(token_tag, Tag)):
        log(f'Failed test 1-4: There\'s no token input tag, or the token tag has changed.', group)
        return False
    elif ('value' not in token_tag.attrs):
        log(f'Failed test 1-5: There\'s no value in the token tag.', group)
        return False
    token = str(token_tag.attrs['value'])
    if (verbose):
        log(f'Successfully retrieved the CSRF token. ({token[:6]}...{token[-6:]})', group)
    
    s.headers.update(HEADER)
    s.headers.update({'X-CSRF-TOKEN': token})
    raw = s.get(URL.format(long=121.54, lat=25.04))

    # Test 2: the API interface
    if (not raw.ok):
        log(f'Failed test 2-1: Error when accessing the API. It may be token\'s problem! (status code: {raw.status_code} - {raw.reason})', group)
        return False
    
    elif (not isinstance(raw.json(), list)):
        log(f'Failed test 2-2: The returned JSON is not a list.', group)
        return False
    return True

def init_log(group: Optional[int]) -> None:
    log_dir = './script/log'
    os.makedirs(log_dir, exist_ok=True)

    if (group is None) or (group == 0):
        log_path = os.path.join(log_dir, 'crawler.txt')
        prev_path = os.path.join(log_dir, 'crawler_prev.txt')
    else:
        log_path = os.path.join(log_dir, f'crawler_g{group}.txt')
        prev_path = os.path.join(log_dir, f'crawler_g{group}_prev.txt')
    
    if os.path.exists(log_path):
        if os.path.exists(prev_path):
            os.remove(prev_path)
        os.rename(log_path, prev_path)

    with open(log_path, 'w', encoding='utf-8') as f:
        f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Initiated the new log.\n")

def log(msg: Any, group: int = 0) -> None:
    '''
    Log the message with a timestamp.
    '''
    msg_str = f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] ' + str(msg)
    print(msg_str)

    log_dir = './script/log'
    os.makedirs(log_dir, exist_ok=True)

    if (group == 0):
        log_path = os.path.join(log_dir, 'crawler.txt')
    else:
        log_path = os.path.join(log_dir, f'crawler_g{group}.txt')
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(msg_str + '\n')

def main(max_runs: Optional[int] = None, group: Optional[int] = 0):
    g = 0 if group is None else group
    try:
        count = 0
        while True:
            log(f'Running group {g} now...', g)
            save_data(g)
            count += 1
            if max_runs and count >= max_runs:
                log('Reached maximum runs. Exiting...', g)
                break
            wait()
    except KeyboardInterrupt:
        log('Terminated by user (Ctrl+C). Exiting gracefully...', g)

def save_data(group: int = 0) -> None:
    '''
    Open a session and save the data.
    '''
    s = requests.Session()
    if (not handshake(s, verbose=True)):
        log('The handshake failed. Terminating the process...', group)
        return
    lots = get_parking_status_around_taipei(s, group, verbose=True)
    time_str = datetime.now().strftime('%u-%H-%M-%S (%Y-%m-%d)')
    if (group == 0):
        lots.to_geojson_file(f'./data/{time_str}.geojson')
        log(f'The result was saved to {time_str}.geojson.', group)
    else:
        lots.to_geojson_file(f'./data/{time_str}({group}).geojson')
        log(f'The result was saved to {time_str}({group}).geojson.', group)

def parse_lot_info(text: dict[str, Any], timestamp: Optional[datetime] = None) -> Lot:
    '''
    Parse the dictionary to the parking lot information.

    Parameter
    --------
    text: dict[str, Any]
        The JSON dictionary.
    
    Returns
    --------
    lot: Lot
        The parking lot container.
    '''
    hour: Optional[str] = None
    id: Optional[str] = None
    name: Optional[str] = None
    shape: shapely.Polygon | None = None
    toll: Optional[int] = None
    vacancy: bool = True # vacancy is the opposite of occupied! 

    if ('parkName' not in text.keys()):
        pass
    elif ('parkId' in text.keys()):
        name = text['parkName']
        id = f'{text["parkName"]}_{text["parkId"]}'
    else:
        name = text['parkName']
        id = f'Unknown_{text["parkId"]}'

    if ('servicetime' in text.keys()):
        hour = text['servicetime']

    if ('payex' in text.keys()):
        toll_str = str(text['payex']).replace('元', '')
        try:
            toll = int(toll_str)
        except:
            toll = None
    
    if ('remark' in text.keys()):
        remark = str(text['remark'])
        if ('有車' in remark):
            vacancy = False
        elif ('空格' in remark):
            vacancy = True
    
    if ('wkt' in text.keys()):
        wkt = str(text['wkt'])
        geometry = shapely.from_wkt(wkt, on_invalid='ignore')
        if (isinstance(geometry, shapely.Polygon)):
            shape = geometry
    
    if (timestamp is None):
        timestamp = datetime.now()
    
    return Lot(id, name, not vacancy, hour, shape, timestamp, toll)

def retry_api_call(s: requests.Session, lon: float, lat: float, retry: int) -> bool:
    if (retry < 2):
        log(f'Retry in 10 seconds...')
        sleep(10)
        get_parking_status_at(s, lon, lat, retry=retry+1)
        return True

    else:
        log(f'The retry attempt has reached the limit. Aborting the process...')
        return False

def wait():
    now = datetime.now()
    minutes = (now.minute // 10 + 1) * 10
    if minutes == 60:
        next_run = (now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
    else:
        next_run = now.replace(minute=minutes, second=0, microsecond=0)
    wait_seconds = (next_run - now).total_seconds()
    sleep(wait_seconds)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Access Taipei City\'s roadside parking vacancy API and save them as GeoJSON.')
    parser.add_argument(
        '--run', '-r',
        type=int,
        default=1,
        help='The number of runs. Leave it 0 to loop forever.'
    )
    parser.add_argument(
        '--group', '-g',
        type=int,
        default=0,
        help='The code of predefined region. (1 = North, 2 = West, 3 = South, 4 = East)'
    )
    args = parser.parse_args()
    init_log(group=args.group)
    main(max_runs=args.run, group=args.group)