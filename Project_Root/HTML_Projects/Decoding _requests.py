import requests
from bs4 import BeautifulSoup


def decode_secret_message(url):
    """
    Downloads a published Google Doc containing a table with:
        x-coordinate | Character | y-coordinate

    Prints the resulting character grid.
    """

    # Download document
    response = requests.get(url)
    response.raise_for_status()

    # Parse HTML
    soup = BeautifulSoup(response.text, "html.parser")

    table = soup.find("table")
    if table is None:
        raise ValueError("No table found in document.")

    points = []

    max_x = 0
    max_y = 0

    # Skip header row
    rows = table.find_all("tr")[1:]

    for row in rows:
        cols = row.find_all("td")

        if len(cols) != 3:
            continue

        x = int(cols[0].get_text(strip=True))
        char = cols[1].get_text()
        y = int(cols[2].get_text(strip=True))

        points.append((x, y, char))

        max_x = max(max_x, x)
        max_y = max(max_y, y)

    # Build blank grid
    grid = [[" " for _ in range(max_x + 1)]
            for _ in range(max_y + 1)]

    # Place characters
    for x, y, char in points:
        grid[y][x] = char

    # Print grid
    for row in grid:
        print("".join(row))