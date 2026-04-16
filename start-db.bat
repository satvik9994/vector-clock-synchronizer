@echo off
echo Starting Local MongoDB...
echo Database path: %~dp0db-data

:: Create the data directory if it doesn't exist
if not exist "%~dp0db-data" mkdir "%~dp0db-data"

:: Start the MongoDB 8.2 server
"C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --dbpath "%~dp0db-data"
