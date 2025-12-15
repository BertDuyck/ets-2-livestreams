#!/usr/bin/env python3
import re
import urllib.request
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed

def test_stream(url, timeout=5):
    """Test if a stream URL is accessible"""
    try:
        req = urllib.request.Request(url, method='HEAD')
        req.add_header('User-Agent', 'Mozilla/5.0')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status in [200, 302, 301]
    except:
        # If HEAD fails, try GET with range
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0')
            req.add_header('Range', 'bytes=0-100')
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status in [200, 206]
        except:
            return False

def parse_sii_file(filepath):
    """Parse the SII file and extract stream data"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract header and footer
    header_match = re.search(r'^(.*?stream_data: \d+\n)', content, re.DOTALL)
    footer_match = re.search(r'\n(}\n\n})\s*$', content, re.DOTALL)
    
    header = header_match.group(1) if header_match else ""
    footer = footer_match.group(1) if footer_match else "}\n\n}"
    
    # Extract all stream entries
    pattern = r'stream_data\[(\d+)\]: "(.*?)"'
    streams = []
    for match in re.finditer(pattern, content):
        index = int(match.group(1))
        data = match.group(2)
        parts = data.split('|')
        if len(parts) == 6:
            streams.append({
                'index': index,
                'url': parts[0],
                'name': parts[1],
                'genre': parts[2],
                'language': parts[3],
                'bitrate': parts[4],
                'flag': parts[5],
                'original_data': data
            })
    
    return header, streams, footer

def write_sii_file(filepath, header, working_streams, footer):
    """Write the updated SII file with working streams only"""
    # Update the stream count in header
    new_count = len(working_streams)
    header = re.sub(r'stream_data: \d+', f'stream_data: {new_count}', header)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(header)
        for i, stream in enumerate(working_streams):
            f.write(f' stream_data[{i}]: "{stream["original_data"]}"\n')
        f.write(footer)

def main():
    filepath = 'live_streams.sii'
    
    print("Parsing SII file...")
    header, streams, footer = parse_sii_file(filepath)
    print(f"Found {len(streams)} streams total")
    
    print("\nTesting streams (this may take a while)...")
    working_streams = []
    failed_streams = []
    
    # Test streams with ThreadPoolExecutor for faster processing
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_stream = {executor.submit(test_stream, stream['url']): stream for stream in streams}
        
        completed = 0
        for future in as_completed(future_to_stream):
            stream = future_to_stream[future]
            completed += 1
            
            try:
                is_working = future.result()
                if is_working:
                    working_streams.append(stream)
                    status = "✓"
                else:
                    failed_streams.append(stream)
                    status = "✗"
                
                print(f"[{completed}/{len(streams)}] {status} Stream [{stream['index']}]: {stream['name']}")
            except Exception as e:
                failed_streams.append(stream)
                print(f"[{completed}/{len(streams)}] ✗ Stream [{stream['index']}]: {stream['name']} - Error: {e}")
    
    # Sort working streams by original index to maintain order
    working_streams.sort(key=lambda x: x['index'])
    
    print(f"\n{'='*60}")
    print(f"Results:")
    print(f"  Working streams: {len(working_streams)}")
    print(f"  Failed streams: {len(failed_streams)}")
    print(f"{'='*60}")
    
    if failed_streams:
        print("\nFailed streams:")
        for stream in failed_streams:
            print(f"  [{stream['index']}] {stream['name']} - {stream['url']}")
    
    # Write updated file
    print(f"\nWriting updated file...")
    write_sii_file(filepath, header, working_streams, footer)
    print(f"✓ File updated successfully!")
    print(f"  New stream count: {len(working_streams)}")

if __name__ == "__main__":
    main()
