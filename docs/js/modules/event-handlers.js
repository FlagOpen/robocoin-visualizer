/**
 * @file Event Handlers Module
 * @description Centralizes all event binding and handling logic
 */

/// <reference path="../types.js" />

import ConfigManager from './config.js';
import { debounce } from './virtual-scroll.js';

/**
 * Event Handlers Manager Class
 */
export class EventHandlers {
    /**
     * @param {Object} managers - Object containing all manager instances
     * @param {Object} managers.filter - Filter manager
     * @param {Object} managers.videoGrid - Video grid manager
     * @param {Object} managers.selectionPanel - Selection panel manager
     * @param {Object} managers.ui - UI utilities
     * @param {Set<string>} selectedDatasets - Selected dataset paths
     * @param {Map<string, Dataset>} datasetMap - Dataset map
     */
    constructor(managers, selectedDatasets, datasetMap) {
        this.managers = managers;
        this.selectedDatasets = selectedDatasets;
        this.datasetMap = datasetMap;
        this.config = ConfigManager.getConfig();
    }
    
    /**
     * Bind all events
     */
    bindEvents() {
        this.bindFilterEvents();
        this.bindVideoGridEvents();
        this.bindSelectionListEvents();
        this.bindToolbarEvents();
        this.bindResizeEvents();
        this.bindScrollEvents();
    }
    
    /**
     * Bind filter-related events
     */
    bindFilterEvents() {
        // Search box (debounced)
        const searchBox = document.getElementById('searchBox');
        if (searchBox) {
            searchBox.addEventListener('input', debounce(() => {
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            }, 150));
        }
        
        // Filter dropdown events
        const filterTriggerBtn = document.getElementById('filterTriggerBtn');
        const filterDropdownClose = document.getElementById('filterDropdownClose');
        const filterDropdownOverlay = document.getElementById('filterDropdownOverlay');
        
        if (filterTriggerBtn) {
            filterTriggerBtn.addEventListener('click', () => {
                this.managers.ui.openFilterDropdown();
                // Initialize tooltips when dropdown opens
                this.managers.filter.initializeTooltips();
                // Focus search input when dropdown opens
                setTimeout(() => {
                    const searchInput = document.getElementById('filterFinderInput');
                    if (searchInput) {
                        searchInput.focus();
                    }
                }, 100);
            });
        }
        
        if (filterDropdownClose) {
            filterDropdownClose.addEventListener('click', () => {
                this.managers.ui.closeFilterDropdown();
                this.managers.filter.hideTooltip();
                // Clear search when closing
                const searchInput = document.getElementById('filterFinderInput');
                if (searchInput) {
                    searchInput.value = '';
                    this.managers.filter.clearFilterSearch();
                }
            });
        }
        
        if (filterDropdownOverlay) {
            filterDropdownOverlay.addEventListener('click', (e) => {
                if (e.target.id === 'filterDropdownOverlay') {
                    this.managers.ui.closeFilterDropdown();
                    this.managers.filter.hideTooltip();
                    // Clear search when closing
                    const searchInput = document.getElementById('filterFinderInput');
                    if (searchInput) {
                        searchInput.value = '';
                        this.managers.filter.clearFilterSearch();
                    }
                }
            });
        }
        
        // Filter finder (search) events
        this.bindFilterFinderEvents();
        
        // Reset filters button
        const resetFiltersBtn = document.getElementById('resetFiltersBtn');
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                this.addClickAnimation(resetFiltersBtn);
                document.getElementById('searchBox').value = '';
                this.managers.filter.resetFilters();
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            });
        }
        
        // Hub selection buttons
        const hubBtnHuggingFace = document.getElementById('hubBtnHuggingFace');
        const hubBtnModelScope = document.getElementById('hubBtnModelScope');
        
        if (hubBtnHuggingFace) {
            hubBtnHuggingFace.addEventListener('click', () => {
                this.managers.selectionPanel.setHub('huggingface');
                this.updateHubButtons('huggingface');
            });
        }
        
        if (hubBtnModelScope) {
            hubBtnModelScope.addEventListener('click', () => {
                this.managers.selectionPanel.setHub('modelscope');
                this.updateHubButtons('modelscope');
            });
        }
        
        // Initialize hub button states
        this.updateHubButtons(this.managers.selectionPanel.currentHub);
        
        // Quick-action buttons and tooltips (event delegation)
        this.bindFilterDropdownEvents();
    }
    
    /**
     * Update hub button states
     * @param {string} activeHub - Active hub name ('huggingface' or 'modelscope')
     */
    updateHubButtons(activeHub) {
        const hubBtnHuggingFace = document.getElementById('hubBtnHuggingFace');
        const hubBtnModelScope = document.getElementById('hubBtnModelScope');
        
        if (hubBtnHuggingFace) {
            if (activeHub === 'huggingface') {
                hubBtnHuggingFace.classList.add('active');
            } else {
                hubBtnHuggingFace.classList.remove('active');
            }
        }
        
        if (hubBtnModelScope) {
            if (activeHub === 'modelscope') {
                hubBtnModelScope.classList.add('active');
            } else {
                hubBtnModelScope.classList.remove('active');
            }
        }
    }
    
    /**
     * Bind filter finder (search) events
     */
    bindFilterFinderEvents() {
        const filterFinderInput = document.getElementById('filterFinderInput');
        const filterFinderPrev = document.getElementById('filterFinderPrev');
        const filterFinderNext = document.getElementById('filterFinderNext');
        
        if (!filterFinderInput) return;
        
        // Search input event
        filterFinderInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.managers.filter.searchFilterOptions(query);
        });
        
        // Previous/Next button events
        if (filterFinderPrev) {
            filterFinderPrev.addEventListener('click', () => {
                this.managers.filter.navigateFilterMatch('prev');
            });
        }
        
        if (filterFinderNext) {
            filterFinderNext.addEventListener('click', () => {
                this.managers.filter.navigateFilterMatch('next');
            });
        }
        
        // Keyboard shortcuts
        filterFinderInput.addEventListener('keydown', (e) => {
            // Escape: clear search
            if (e.key === 'Escape') {
                filterFinderInput.value = '';
                this.managers.filter.clearFilterSearch();
                filterFinderInput.blur();
                return;
            }
            
            // Arrow keys: navigate matches
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (filterFinderInput.value.trim()) {
                    this.managers.filter.navigateFilterMatch('prev');
                }
                return;
            }
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (filterFinderInput.value.trim()) {
                    this.managers.filter.navigateFilterMatch('next');
                }
                return;
            }
            
            // Enter: select current match or navigate to next
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = filterFinderInput.value.trim();
                if (!query) return;
                
                const currentMatch = this.managers.filter.filterFinderMatches[this.managers.filter.filterFinderCurrentIndex];
                if (currentMatch && currentMatch.element) {
                    const option = currentMatch.element;
                    const filterKey = option.dataset.filter;
                    const filterValue = option.dataset.value;
                    if (filterKey && filterValue) {
                        const label = option.querySelector('.filter-option-label')?.textContent?.trim() || filterValue;
                        this.managers.filter.toggleFilterSelection(filterKey, filterValue, label, option);
                    }
                }
                return;
            }
        });
        
        // Global Ctrl+F / Cmd+F shortcut to focus search
        document.addEventListener('keydown', (e) => {
            // Check if filter dropdown is open
            const overlay = document.getElementById('filterDropdownOverlay');
            if (!overlay || !overlay.classList.contains('active')) return;
            
            // Ctrl+F or Cmd+F
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                filterFinderInput.focus();
                filterFinderInput.select();
            }
        });
    }
    
    /**
     * Bind filter dropdown events (quick-actions and tooltips)
     */
    bindFilterDropdownEvents() {
        const filterGroups = document.getElementById('filterGroups');
        if (!filterGroups) return;
        
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Hierarchy action buttons (All/Clear buttons for all levels)
        filterGroups.addEventListener('click', (e) => {
            const hierarchyActionBtn = e.target.closest('.hierarchy-action-btn');
            if (hierarchyActionBtn) {
                e.stopPropagation(); // Prevent menu collapse
                
                const action = hierarchyActionBtn.dataset.action;
                
                // Top-level group buttons (have data-group)
                const groupKey = hierarchyActionBtn.dataset.group;
                if (groupKey) {
                    if (action === 'select-all') {
                        this.managers.filter.selectAllInGroup(groupKey);
                    } else if (action === 'clear-group') {
                        this.managers.filter.clearGroup(groupKey);
                    }
                    return;
                }
                
                // Hierarchy item buttons (have data-key and data-path)
                const key = hierarchyActionBtn.dataset.key;
                const path = hierarchyActionBtn.dataset.path;
                if (key && path) {
                    if (action === 'select-all-children') {
                        this.managers.filter.selectAllChildrenInHierarchy(key, path);
                    } else if (action === 'clear-all-children') {
                        this.managers.filter.clearAllChildrenInHierarchy(key, path);
                    }
                    return;
                }
            }
        });
        
        // Tooltip events (non-touch devices)
        if (!isTouchDevice) {
            filterGroups.addEventListener('mouseenter', (e) => {
                const option = e.target.closest('.filter-option');
                if (!option) return;
                
                const filterKey = option.dataset.filter;
                const filterValue = option.dataset.value;
                
                if (filterKey && filterValue) {
                    this.managers.filter.showTooltip(option, filterKey, filterValue);
                }
            }, true);
            
            filterGroups.addEventListener('mouseleave', (e) => {
                const option = e.target.closest('.filter-option');
                if (!option) return;
                
                this.managers.filter.hideTooltip();
            }, true);
        }
        
        // Touch device tooltip handling
        if (isTouchDevice) {
            let lastTouchTarget = null;
            
            filterGroups.addEventListener('touchstart', (e) => {
                const option = e.target.closest('.filter-option');
                if (!option) {
                    this.managers.filter.hideTooltip();
                    lastTouchTarget = null;
                    return;
                }
                
                const filterKey = option.dataset.filter;
                const filterValue = option.dataset.value;
                
                if (filterKey && filterValue) {
                    if (lastTouchTarget === option) {
                        // Second tap - hide tooltip and proceed with selection
                        this.managers.filter.hideTooltip();
                        lastTouchTarget = null;
                    } else {
                        // First tap - show tooltip
                        this.managers.filter.showTooltip(option, filterKey, filterValue);
                        lastTouchTarget = option;
                        e.preventDefault(); // Prevent immediate selection
                    }
                }
            });
        }
    }
    
    /**
     * Bind video grid events (event delegation)
     */
    bindVideoGridEvents() {
        const grid = document.getElementById('videoGrid');
        if (!grid) return;
        
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Event delegation: click on video-card
        grid.addEventListener('click', (e) => {
            if (e.target.tagName === 'VIDEO') return;
            
            const card = e.target.closest('.video-card');
            if (!card) return;
            
            const path = card.dataset.path;
            if (!path) return;
            
            // Touch device overlay handling
            const overlay = e.target.closest('.video-hover-overlay');
            if (isTouchDevice && overlay) {
                overlay.classList.remove('touch-active');
                return;
            }
            
            if (isTouchDevice) {
                const cardOverlay = card.querySelector('.video-hover-overlay');
                if (cardOverlay && !cardOverlay.classList.contains('touch-active')) {
                    document.querySelectorAll('.video-hover-overlay.touch-active').forEach(o => {
                        o.classList.remove('touch-active');
                    });
                    cardOverlay.classList.add('touch-active');
                    return;
                }
            }
            
            this.toggleSelection(path);
        });
        
        // Video load error handling
        grid.addEventListener('error', (e) => {
            if (e.target.tagName === 'VIDEO') {
                const card = e.target.closest('.video-card');
                if (card) {
                    const errorDiv = card.querySelector('.video-error');
                    if (errorDiv) errorDiv.style.display = 'block';
                }
            }
        }, true);
        
        // Touch device: close overlays when clicking outside
        if (isTouchDevice) {
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.video-card')) {
                    document.querySelectorAll('.video-hover-overlay.touch-active').forEach(o => {
                        o.classList.remove('touch-active');
                    });
                }
            });
        }
    }
    
    /**
     * Bind selection list events (event delegation)
     */
    bindSelectionListEvents() {
        const list = document.getElementById('selectionList');
        if (!list) return;
        
        // Click events
        list.addEventListener('click', (e) => {
            const item = e.target.closest('.selection-item');
            if (!item) return;
            
            const path = item.dataset.path;
            if (!path) return;
            
            // Remove button
            if (e.target.closest('.btn-remove')) {
                e.stopPropagation();
                this.managers.selectionPanel.listDatasets.delete(path);
                this.managers.selectionPanel.markListChanged();
                this.managers.videoGrid.updateCardStyles();
                this.managers.selectionPanel.updateSelectionPanel();
                return;
            }
            
            // Detail button
            if (e.target.closest('.btn-detail')) {
                e.stopPropagation();
                this.managers.ui.showDetailModal(path, this.datasetMap);
                return;
            }
            
            // Toggle selection
            if (this.selectedDatasets.has(path)) {
                this.selectedDatasets.delete(path);
            } else {
                this.selectedDatasets.add(path);
            }
            this.managers.videoGrid.updateCardStyles();
            this.managers.selectionPanel.updateSelectionPanel();
        });
    }
    
    /**
     * Add click animation to button
     * @param {HTMLElement} button - Button element
     */
    addClickAnimation(button) {
        if (!button) return;
        
        // Remove existing animation class if present
        button.classList.remove('click-animate');
        
        // Force reflow to ensure class removal is processed
        void button.offsetWidth;
        
        // Add animation class
        button.classList.add('click-animate');
        
        // Remove class after animation completes (300ms)
        setTimeout(() => {
            button.classList.remove('click-animate');
        }, 300);
    }
    
    /**
     * Bind toolbar button events
     */
    bindToolbarEvents() {
        // Select/Deselect all
        const selectAllBtn = document.getElementById('selectAllBtn');
        const deselectAllBtn = document.getElementById('deselectAllBtn');
        
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                this.addClickAnimation(selectAllBtn);
                this.selectAllFiltered();
            });
        }
        
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => {
                this.addClickAnimation(deselectAllBtn);
                this.deselectAllFiltered();
            });
        }
        
        // Cart actions
        const addToListBtn = document.getElementById('addToListBtn');
        const deleteFromListBtn = document.getElementById('deleteFromListBtn');
        const clearListBtn = document.getElementById('clearListBtn');
        
        if (addToListBtn) {
            addToListBtn.addEventListener('click', () => {
                this.addClickAnimation(addToListBtn);
                this.managers.selectionPanel.addToList();
                this.managers.videoGrid.updateCardStyles();
                this.managers.selectionPanel.updateSelectionPanel();
            });
        }
        
        if (deleteFromListBtn) {
            deleteFromListBtn.addEventListener('click', () => {
                this.addClickAnimation(deleteFromListBtn);
                this.managers.selectionPanel.deleteFromList();
                this.managers.videoGrid.updateCardStyles();
                this.managers.selectionPanel.updateSelectionPanel();
            });
        }
        
        if (clearListBtn) {
            clearListBtn.addEventListener('click', () => {
                this.addClickAnimation(clearListBtn);
                this.managers.selectionPanel.clearList();
                this.managers.videoGrid.updateCardStyles();
                this.managers.selectionPanel.updateSelectionPanel();
            });
        }
        
        // Import/Export
        const importBtn = document.getElementById('importBtn');
        const importFile = document.getElementById('importFile');
        const exportBtn = document.getElementById('exportBtn');
        const copyCodeBtn = document.getElementById('copyCodeBtn');
        
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                importFile.click();
            });
        }
        
        if (importFile) {
            importFile.addEventListener('change', (e) => {
                // 传入回调函数，在导入完成后更新视频网格样式
                this.managers.selectionPanel.handleImportFile(
                    e, 
                    this.managers.filter.datasets,
                    () => {
                        // 导入完成后更新视频网格样式
                        this.managers.videoGrid.updateCardStyles();
                    }
                );
            });
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.managers.selectionPanel.exportSelection();
            });
        }
        
        if (copyCodeBtn) {
            copyCodeBtn.addEventListener('click', () => {
                this.managers.selectionPanel.copyCode();
            });
        }
        
        // Code detail button toggle
        const codeDetailBtn = document.getElementById('codeDetailBtn');
        const codeDetailPanel = document.getElementById('codeDetailPanel');
        if (codeDetailBtn && codeDetailPanel) {
            const codeDetailContent = codeDetailPanel.querySelector('.code-detail-content');
            
            // Load content from CSS variable
            const loadDetailContent = () => {
                const computedStyle = getComputedStyle(document.documentElement);
                const tooltipText = computedStyle.getPropertyValue('--code-detail-tooltip-text').trim();
                // Remove quotes if present
                let cleanText = tooltipText.replace(/^["']|["']$/g, '');
                // Convert \n to actual newlines for display
                cleanText = cleanText.replace(/\\n/g, '\n');
                if (codeDetailContent) {
                    codeDetailContent.textContent = cleanText;
                }
            };
            
            loadDetailContent();
            
            codeDetailBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = codeDetailPanel.classList.contains('expanded');
                
                if (isExpanded) {
                    codeDetailPanel.classList.remove('expanded');
                    codeDetailBtn.classList.remove('active');
                } else {
                    codeDetailPanel.classList.add('expanded');
                    codeDetailBtn.classList.add('active');
                }
            });
            
            // Close panel when clicking outside
            document.addEventListener('click', (e) => {
                if (codeDetailPanel.classList.contains('expanded') && 
                    !codeDetailPanel.contains(e.target) && 
                    !codeDetailBtn.contains(e.target)) {
                    codeDetailPanel.classList.remove('expanded');
                    codeDetailBtn.classList.remove('active');
                }
            });
        }
    }
    
    /**
     * Bind window resize events
     */
    bindResizeEvents() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const filteredDatasets = this.managers.filter.applyFilters(
                    document.getElementById('searchBox')?.value || ''
                );
                this.managers.videoGrid.renderVideoGrid(filteredDatasets);
            }, 200);
        });
    }
    
    /**
     * Bind scroll events for virtual scrolling
     */
    bindScrollEvents() {
        // Video grid scroll
        const gridContainer = document.querySelector('.video-grid-container');
        if (gridContainer) {
            let videoScrollTicking = false;
            
            gridContainer.addEventListener('scroll', () => {
                if (!videoScrollTicking) {
                    window.requestAnimationFrame(() => {
                        const filteredDatasets = this.managers.filter.applyFilters(
                            document.getElementById('searchBox')?.value || ''
                        );
                        this.managers.videoGrid.renderVideoGrid(filteredDatasets);
                        videoScrollTicking = false;
                    });
                    videoScrollTicking = true;
                }
            });
        }
        
        // Selection list scroll
        const selectionList = document.getElementById('selectionList');
        if (selectionList) {
            let selectionScrollTicking = false;
            
            selectionList.addEventListener('scroll', () => {
                if (!selectionScrollTicking) {
                    window.requestAnimationFrame(() => {
                        this.managers.selectionPanel.updateSelectionPanel();
                        selectionScrollTicking = false;
                    });
                    selectionScrollTicking = true;
                }
            });
        }
    }
    
    /**
     * Toggle dataset selection
     * @param {string} path - Dataset path
     */
    toggleSelection(path) {
        if (this.selectedDatasets.has(path)) {
            this.selectedDatasets.delete(path);
        } else {
            this.selectedDatasets.add(path);
        }
        this.managers.videoGrid.updateCardStyles();
        this.managers.selectionPanel.updateSelectionPanel();
    }
    
    /**
     * Select all filtered datasets
     */
    selectAllFiltered() {
        const filteredDatasets = this.managers.filter.applyFilters(
            document.getElementById('searchBox')?.value || ''
        );
        filteredDatasets.forEach(ds => {
            this.selectedDatasets.add(ds.path);
        });
        this.managers.videoGrid.updateCardStyles();
        this.managers.selectionPanel.updateSelectionPanel();
    }
    
    /**
     * Deselect all filtered datasets
     */
    deselectAllFiltered() {
        const filteredDatasets = this.managers.filter.applyFilters(
            document.getElementById('searchBox')?.value || ''
        );
        filteredDatasets.forEach(ds => {
            this.selectedDatasets.delete(ds.path);
        });
        this.managers.videoGrid.updateCardStyles();
        this.managers.selectionPanel.updateSelectionPanel();
    }
}

export default EventHandlers;

