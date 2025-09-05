import argparse
from datetime import datetime
import geopandas as gpd
import json
import os
import re
from typing import Any, Literal

# Constants
DATA_DIR = './data'
INFO = 'info'
LOG_DIR = './script/log'
NONE = 'none'
VERBOSE = 'verbose'
WEEKDAY = {1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday'}

# Variables
__log_level__: Literal[0, 1, 2] = 2

# Classes
class LotsHistory:
    history: dict[str, dict[int, list[int | None]]] = {}

    def add_history(self: 'LotsHistory', id: str, day_of_week: int, hour: int, minute: int, occupied: bool) -> None:
        if (id in self.history.keys()):
            lot = self.history[id]
            if (day_of_week in lot.keys()):
                day_data = lot[day_of_week]
                if (len(day_data) == 144):
                    day_data[int(hour * 6 + minute / 10)] = int(occupied)
                    return
                else:
                    day_data = [None] * 144
            else:
                lot[day_of_week] = [None] * 144
        else:
            self.add_new_lot(id)
        
        # Retry until the record is fixed.
        self.add_history(id, day_of_week, hour, minute, occupied)

    def add_new_lot(self: 'LotsHistory', id: str) -> None:
        if (id in self.history.keys()):
            return
        else:
            # Creates 7 entries for the dictionary, where each of them is a str - list[int|None] pair.
            self.history[id] = {k: [None] * 144 for k in range(1, 8)}
    
    def to_file(self: 'LotsHistory', path: str) -> None:
        JsonHelper.dump(self.history, path, indent=2)
            
    def __len__(self: 'LotsHistory') -> int:
        return len(self.history)
    
    @classmethod
    def load_file(cls, path: str) -> 'LotsHistory':
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        obj = cls()
        obj.history = {k: {int(d): v for d, v in inner.items()} for k, inner in data.items()}
        return obj

class JsonHelper:
    '''
    Custom JSON serializer.
    '''
    @classmethod
    def _is_primitive(cls, x: Any) -> bool:
        return x is None or isinstance(x, (bool, int, float, str))

    @classmethod
    def _dumps_pretty_inline_lists(cls, obj: Any, indent: int = 2, level: int = 0) -> str:
        pad = " " * (indent * level)
        if isinstance(obj, dict):
            if not obj:
                return "{}"
            lines = []
            for k, v in obj.items():
                key = json.dumps(str(k), ensure_ascii=False)
                val = JsonHelper._dumps_pretty_inline_lists(v, indent, level + 1)
                lines.append((" " * (indent * (level + 1))) + f"{key}: {val}")
            return "{\n" + ",\n".join(lines) + "\n" + pad + "}"
        elif isinstance(obj, list):
            if all(JsonHelper._is_primitive(el) for el in obj):
                return json.dumps(obj, ensure_ascii=False, separators=(",", ": "))
            if not obj:
                return "[]"
            lines = [
                (" " * (indent * (level + 1))) + JsonHelper._dumps_pretty_inline_lists(el, indent, level + 1)
                for el in obj
            ]
            return "[\n" + ",\n".join(lines) + "\n" + pad + "]"
        else:
            return json.dumps(obj, ensure_ascii=False)

    @classmethod
    def dump(cls, obj: Any, path: str, indent: int = 2) -> None:
        s = JsonHelper._dumps_pretty_inline_lists(obj, indent=indent)
        with open(path, "w", encoding="utf-8") as f:
            f.write(s)

# Methods
def get_history(history: LotsHistory) -> None:
    file_count = 0

    for path_str in os.listdir(DATA_DIR):
        if (path_str.split('.')[-1] != 'geojson'):
            continue
        else:
            file_name = path_str.split('.')[0]
            time_components = file_name.split(' ')[0].split('-')
            if (len(time_components) != 4):
                continue
            day_of_week: int = 1
            group: int = 0
            hour: int = 0
            minute: int = 0
            file_count += 1
            try:
                day_of_week = int(time_components[0])
                hour = int(time_components[1])
                minute = 10 * (int(time_components[2]) // 10)
                group_match = re.search(r'(?<=\()\d+?(?=\))', file_name)
                if (group_match is not None):
                    group = int(group_match[0])
                read_file(path_str, day_of_week, hour, minute, history)
            except Exception as ex:
                log(f'An error occured when identifying `{path_str}`...', get_log_level(NONE))
                log(ex, get_log_level(NONE))
            finally:
                log(f'Successfully identified: G{group} | {WEEKDAY[day_of_week]} {hour:02}:{minute:02}', get_log_level(VERBOSE))
    
    log(f'Finished processing {file_count} files. There are {len(history)} parking lots in the records.', get_log_level(NONE))

def get_log_level(level: Literal['info', 'none', 'verbose']) -> Literal[0, 1, 2]:
    match level:
        case 'info':
            return 1
        case 'none':
            return 2
        case 'verbose':
            return 0
        case _:
            return 0

def log(msg: Any, level: Literal[0, 1, 2]) -> None:
    # if (level >= __log_level__):
        msg_str = f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] ' + str(msg)
        print(msg_str)

        os.makedirs(LOG_DIR, exist_ok=True)
        log_path = os.path.join(LOG_DIR, 'aggregate.txt')
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(msg_str + '\n')

def main(log_level: Literal['info', 'none', 'verbose'], load_file: str | None = None) -> None:
    __log_level__ = get_log_level(log_level)
    history = LotsHistory()
    if (load_file is not None):
        history = LotsHistory.load_file(load_file)
    get_history(history)
    history.to_file(f'{DATA_DIR}/history.json')
    log('Finished processing.', get_log_level(NONE))

def read_file(path: str, day_of_week: int, hour: int, minute: int, history: LotsHistory) -> None:
    gdf = gpd.read_file(f'{DATA_DIR}/{path}')
    if (('id' in gdf.columns) & ('occupied' in gdf.columns)):
        for (i, row) in gdf.iterrows():
            history.add_history(row['id'], day_of_week, hour, minute, row['occupied'])

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Aggregate GeoJSON files into one JSON.')
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging.'
    )
    parser.add_argument(
        '--load-file', '-l',
        type=str,
        default=None,
        help='Loads history file.'
    )
    args = parser.parse_args()
    main('verbose' if args.verbose else 'info', args.load_file)