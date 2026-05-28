"""
Schema Mapping Module for MLB to MLBFinal Database Migration

This module contains the table and column name mappings needed to transform
SQL queries from the old 'mlb' database schema to the new 'mlbfinal' schema.
"""

# Table name mappings (mlb -> mlbfinal)
TABLE_MAPPINGS = {
    "battingstatsgame": "playerstatsgame_batting",
    "battingstatsseason": "playerstatsseason_batting",
    "pitchingstatsgame": "playerstatsgame_pitching",
    "pitchingstatsseason": "playerstatsseason_pitching",
    "stadiums": "ballparks",
    "teamsmetadata": "teams",
    "playersmetadata": "players",
    "teamstatsgame": "teamstatsgame_batting",
    "teamstatsseason": "teamstatsseason_batting",
}

# Column name mappings (mlb -> mlbfinal)
COLUMN_MAPPINGS = {
    "season": "season_year",
    "player_team_id": "team_id",
    "player_team_abbreviation": "team_abbreviation",
    "stadium_id": "ballpark_id",
    "date_time": "game_date",
    "name": "player_full_name",
    "homeruns": "home_runs",
    "rbis": "runs_batted_in",
    "batting_average": "average",
    "times_caught_stealing": "caught_stealing",
    "grounded_into_double_plays": "ground_into_double_play",
    "times_hit_by_pitch": "hit_by_pitch",
    "sacrifices": "sacrifice_hits",
    "batting_order": "lineup_position",
    "is_win": "player_team_won",
    "player_team_runs": "team_runs",
    "opponent_team_runs": "opponent_runs",
    "innings_pitched_decimal": "innings_pitched",
    "pitching_hits": "hits_allowed",
    "pitching_runs": "runs_allowed",
    "pitching_earned_runs": "earned_runs",
    "pitching_walks": "walks",
    "pitching_strikeouts": "strikeouts",
    "pitching_home_runs": "home_runs_allowed",
    "earned_run_average": "era",
    "pitches_thrown_strikes": "strikes_thrown",
    "walks_hits_per_innings_pitched": "whip",
    "percentage": "win_loss_percentage",
    "games_behind": "games_back",
    "runs_scored": "runs",
}

SEASON_SPECIFIC_MAPPINGS = {
    "rbis": "rbi",
    "batting_average": "batting_avg",
    "grounded_into_double_plays": "gidp",
    "name": "player_name",
}

MLBFINAL_TABLES = {
    "awards", "ballparks", "bettingdata", "coaches", "drafts", "ejections",
    "games", "innings", "managers", "managerstatsseason", "playbyplay",
    "players", "playerstatsgame_batting", "playerstatsgame_fielding",
    "playerstatsgame_pitching", "playerstatsseason_batting",
    "playerstatsseason_fielding", "playerstatsseason_pitching",
    "retro_uuid_map", "schedules", "seasons", "standings", "teams",
    "teamstatsgame_batting", "teamstatsgame_fielding", "teamstatsgame_pitching",
    "teamstatsseason_batting", "teamstatsseason_fielding", "teamstatsseason_pitching",
    "umpires",
}

import re
from typing import Tuple, List

def transform_query_auto(sql: str) -> Tuple[str, List[str]]:
    """Transform a SQL query from mlb schema to mlbfinal schema."""
    warnings = []
    transformed = sql
    is_season = "statsseason" in sql.lower()
    
    # Apply table mappings
    for old_table, new_table in TABLE_MAPPINGS.items():
        pattern = re.compile(r'\b' + re.escape(old_table) + r'\b', re.IGNORECASE)
        if pattern.search(transformed):
            transformed = pattern.sub(new_table, transformed)
            warnings.append(f"Table: {old_table} -> {new_table}")
    
    # Apply column mappings
    column_map = COLUMN_MAPPINGS.copy()
    if is_season:
        column_map.update(SEASON_SPECIFIC_MAPPINGS)
    
    for old_col, new_col in column_map.items():
        pattern = re.compile(r'(?<!_)\b' + re.escape(old_col) + r'\b(?!_)', re.IGNORECASE)
        if pattern.search(transformed):
            transformed = pattern.sub(new_col, transformed)
            if old_col != new_col:
                warnings.append(f"Column: {old_col} -> {new_col}")
    
    # Check for hardcoded integer IDs
    if re.search(r'\b\w+_id\s*=\s*\d+', sql, re.IGNORECASE):
        warnings.append("WARNING: Query uses hardcoded integer IDs - mlbfinal uses UUIDs")
    
    return transformed, warnings

def validate_transformed_query(sql: str, mlbfinal_tables: set) -> List[str]:
    """Validate that transformed query references valid mlbfinal tables."""
    errors = []
    table_pattern = re.compile(r'\b(?:FROM|JOIN)\s+(\w+)', re.IGNORECASE)
    matches = table_pattern.findall(sql)
    for table in matches:
        if table.lower() not in {t.lower() for t in mlbfinal_tables}:
            errors.append(f"Unknown table: {table}")
    return errors

if __name__ == "__main__":
    test = "SELECT name, homeruns, rbis FROM battingstatsgame WHERE season = 2024"
    result, warnings = transform_query_auto(test)
    print(f"Original: {test}")
    print(f"Transformed: {result}")
    for w in warnings:
        print(f"  - {w}")
