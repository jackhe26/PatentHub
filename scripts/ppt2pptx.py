#!/usr/bin/env python3
"""
Convert PowerPoint .ppt (OLE2 binary) to .pptx (OOXML) format.
Uses Microsoft PowerPoint COM interface (Windows only).

Usage:
    python ppt2pptx.py <input.ppt> <output.pptx>
    
Exit codes:
    0 - Success
    1 - Error (missing dependencies, file not found, etc.)
"""

import sys
import os
import traceback

def convert_ppt_to_pptx(input_path: str, output_path: str) -> bool:
    """
    Convert a .ppt file to .pptx using PowerPoint COM automation.
    Returns True on success, False on failure.
    """
    if not os.path.exists(input_path):
        print(f"[ppt2pptx] ERROR: Input file not found: {input_path}", file=sys.stderr)
        return False
    
    try:
        import win32com.client
    except ImportError:
        print("[ppt2pptx] ERROR: pywin32 is not installed.", file=sys.stderr)
        print("[ppt2pptx] Install it with: pip install pywin32", file=sys.stderr)
        return False

    powerpoint = None
    presentation = None
    
    try:
        # Initialize PowerPoint
        powerpoint = win32com.client.Dispatch("PowerPoint.Application")
        # NOTE: Do NOT set Visible=False — some PowerPoint versions block it
        # The calling Node.js process uses windowsHide:true to keep it in background
        powerpoint.DisplayAlerts = 0  # Suppress alert dialogs
        
        # Open the presentation (read-only, no window)
        presentation = powerpoint.Presentations.Open(
            input_path, 
            WithWindow=False,
            ReadOnly=True
        )
        
        # Save as PPTX (24 = ppSaveAsOpenXMLPresentation)
        # Reference: https://docs.microsoft.com/en-us/office/vba/api/PowerPoint.PpSaveAsFileType
        ppSaveAsOpenXMLPresentation = 24
        presentation.SaveAs(output_path, ppSaveAsOpenXMLPresentation)
        
        presentation.Close()
        powerpoint.Quit()
        
        # Verify output exists and has content
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            print(f"[ppt2pptx] SUCCESS: Converted to {output_path}")
            return True
        else:
            print("[ppt2pptx] ERROR: Output file is missing or empty", file=sys.stderr)
            return False
            
    except Exception as e:
        print(f"[ppt2pptx] ERROR: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        
        # Clean up if partially opened
        try:
            if presentation:
                presentation.Close()
        except:
            pass
        try:
            if powerpoint:
                powerpoint.Quit()
        except:
            pass
        return False


def main():
    if len(sys.argv) < 3:
        print("Usage: python ppt2pptx.py <input.ppt> <output.pptx>", file=sys.stderr)
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success = convert_ppt_to_pptx(input_path, output_path)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()