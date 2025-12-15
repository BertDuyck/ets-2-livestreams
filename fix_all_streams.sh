#!/bin/bash

INPUT_FILE="live_streams.sii"
TEMP_FILE="live_streams.sii.tmp"
BACKUP_FILE="live_streams.sii.backup"

# Create backup
cp "$INPUT_FILE" "$BACKUP_FILE"
echo "Created backup: $BACKUP_FILE"

# Extract URLs and test them
echo "Extracting and testing streams..."

declare -a working_lines=()
total_count=0
working_count=0
failed_count=0

# Read the file and process stream_data lines
while IFS= read -r line; do
    if [[ $line =~ stream_data\[([0-9]+)\]:\ \"([^\"]+)\" ]]; then
        stream_data="${BASH_REMATCH[2]}"
        url=$(echo "$stream_data" | cut -d'|' -f1)
        name=$(echo "$stream_data" | cut -d'|' -f2)
        
        ((total_count++))
        
        # Test the URL
        echo -n "[$total_count] Testing: $name ... "
        
        # Try curl with timeout, accept 200, 206, 301, 302, or ICY 200
        http_code=$(curl -s -m 5 --range 0-100 -w "%{http_code}" -o /dev/null "$url" 2>/dev/null)
        
        if [[ "$http_code" == "200" || "$http_code" == "206" || "$http_code" == "301" || "$http_code" == "302" ]]; then
            echo "✓ OK ($http_code)"
            working_lines+=("$stream_data")
            ((working_count++))
        else
            echo "✗ FAILED ($http_code)"
            ((failed_count++))
        fi
    fi
done < "$INPUT_FILE"

echo ""
echo "============================================================"
echo "Results:"
echo "  Total streams tested: $total_count"
echo "  Working streams: $working_count"
echo "  Failed streams: $failed_count"
echo "============================================================"

# Write new file
echo ""
echo "Writing updated file..."

# Write header
head -n 4 "$INPUT_FILE" | sed "s/stream_data: [0-9]*/stream_data: $working_count/" > "$TEMP_FILE"

# Write working streams with renumbered indices
index=0
for stream_data in "${working_lines[@]}"; do
    echo " stream_data[$index]: \"$stream_data\"" >> "$TEMP_FILE"
    ((index++))
done

# Write footer
echo "}" >> "$TEMP_FILE"
echo "" >> "$TEMP_FILE"
echo "}" >> "$TEMP_FILE"

# Replace original file
mv "$TEMP_FILE" "$INPUT_FILE"

echo "✓ File updated successfully!"
echo "  New stream count: $working_count"
echo "  Backup saved as: $BACKUP_FILE"
