# Overview

The ASV Natz Penalty Tracking System is a Python-based Excel workbook generator for managing football team penalties. The system creates a comprehensive penalty tracking solution with data entry forms, automated calculations, statistics, and CSV export capabilities. The primary goal is to provide an easy-to-use interface for recording player penalties while automatically calculating costs and generating meaningful statistics for team management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Components

**Excel Workbook Generator (`build_strafenlog.py`)**
- Creates a multi-sheet Excel workbook with automated calculations and data validation
- Implements dropdown menus for consistent data entry using Excel's data validation features
- Uses XLOOKUP/VLOOKUP formulas for automatic penalty cost calculations
- Applies conditional formatting for error highlighting and visual feedback
- Generates 1,500 pre-configured data entry rows to support long-term usage

**Data Export Module (`export_csv.py`)**
- Extracts penalty data from the Excel workbook and converts to CSV format
- Provides data portability for integration with other systems
- Handles file validation and error management during export operations

## Worksheet Structure

**Erfassung (Data Entry)**
- Primary input interface with columns: Date, Player, Offense, Quantity, Unit Cost, Total, Notes
- Implements dropdown validation linked to player and penalty catalogs
- Features automatic cost calculation and data validation rules
- Uses Excel tables with filtering and freeze panes for improved usability

**Supporting Worksheets**
- Spielerliste: Player master data for dropdown population
- Strafenkatalog: Penalty catalog with associated costs
- Statistik: Automated statistics and charts with configurable time periods
- Trainingsplan: Reference information for training schedules

## Data Validation Strategy

**Input Validation**
- Date validation ensures entries fall within reasonable ranges (2000-2100)
- Dropdown constraints prevent invalid player or penalty selections
- Quantity validation requires positive integers
- Conditional formatting highlights incomplete or invalid entries

**Formula-Based Calculations**
- Unit costs automatically populate via lookup functions against penalty catalog
- Total costs calculate as quantity multiplied by unit cost
- Statistics aggregate data across configurable time periods and player selections

## Visual Design Principles

**Consistent Styling**
- Standardized header formatting with blue background (#DDEBF7) and bold fonts
- Zebra-striped data rows using Excel table styles for improved readability
- Optimized column widths and row heights for data visibility
- Border styling and cell alignment for professional appearance

**User Experience Features**
- Freeze panes keep headers visible during scrolling
- Auto-filtering enabled for data sorting and searching
- Named ranges and tables for formula clarity and maintenance
- Error highlighting through conditional formatting rules

# External Dependencies

**Python Libraries**
- `openpyxl` (>=3.1): Excel file creation, manipulation, and formatting
- `csv`: Standard library for CSV export functionality
- `datetime`: Date handling and validation
- `os`: File system operations and path management

**Excel Features**
- Data validation for dropdown menus and input constraints
- Conditional formatting for visual feedback and error highlighting
- Formula functions (XLOOKUP/VLOOKUP) for automated calculations
- Table formatting and named ranges for data organization
- Chart generation for statistical visualization

The system is designed as a standalone solution requiring no external databases or web services, with all data stored locally in Excel format and optional CSV export for integration needs.