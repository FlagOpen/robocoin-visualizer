/**
 * @file Video Grid Module
 * @description Manages video grid rendering with virtual scrolling
 */

/// <reference path="../types.js" />

import ConfigManager from './config.js';
import Templates from '../templates.js';
import { calculateVisibleRange, ElementCache } from './virtual-scroll.js';

/**
 * Video Grid Manager Class
 */
export class VideoGridManager {
    /**
     * @param {Set<string>} selectedDatasets - Selected dataset paths
     * @param {Set<string>} listDatasets - Cart dataset paths
     */
    constructor(selectedDatasets, listDatasets) {
        this.selectedDatasets = selectedDatasets;
        this.listDatasets = listDatasets;
        
        /** @type {Dataset[]} */
        this.filteredDatasets = [];
        
        /** @type {Object} */
        this.config = ConfigManager.getConfig();
        
        /** @type {ElementCache} */
        this._videoCardIndex = new ElementCache();
        
        /** @type {IntersectionObserver|null} */
        this.videoAutoPlayObserver = null;
        
        /** @type {HTMLElement|null} */
        this._tempMeasureDiv = null;
        
        /** @type {boolean} */
        this.updateStylesScheduled = false;
    }
    
    /**
     * Update dynamic grid CSS variables
     * @param {number} cardWidth - Card width
     * @param {number} columns - Number of columns
     */
    updateDynamicGridVariables(cardWidth, columns) {
        document.documentElement.style.setProperty('--grid-card-width', `${cardWidth}px`);
        document.documentElement.style.setProperty('--grid-columns', columns);
        document.documentElement.style.setProperty('--grid-padding', 
            getComputedStyle(document.documentElement).getPropertyValue('--content-padding'));
    }
    
    /**
     * Render video grid with virtual scrolling
     * @param {Dataset[]} datasets - Filtered datasets to render
     */
    renderVideoGrid(datasets) {
        this.filteredDatasets = datasets;
        
        const grid = document.getElementById('videoGrid');
        if (!grid) return;
        
        const container = grid.parentElement;
        if (!container) return;
        
        // Calculate layout parameters
        const gridWidth = grid.clientWidth;
        
        // Get actual pixel values from computed styles
        if (!this._tempMeasureDiv) {
            this._tempMeasureDiv = document.createElement('div');
            this._tempMeasureDiv.style.cssText = `
                position: absolute;
                visibility: hidden;
                top: -9999px;
                left: -9999px;
            `;
            document.body.appendChild(this._tempMeasureDiv);
        }
        
        const tempDiv = this._tempMeasureDiv;
        tempDiv.style.width = 'var(--grid-min-card-width)';
        tempDiv.style.height = 'var(--grid-card-height)';
        tempDiv.style.margin = 'var(--grid-gap)';
        
        const computedTemp = getComputedStyle(tempDiv);
        const minCardWidthPx = parseFloat(computedTemp.width) || 250;
        const cardHeightPx = parseFloat(computedTemp.height) || 300;
        const gapPx = parseFloat(computedTemp.marginTop) || 16;
        
        // Calculate layout
        const itemsPerRow = Math.max(1, Math.floor((gridWidth + gapPx) / (minCardWidthPx + gapPx)));
        const cardWidth = Math.floor((gridWidth - gapPx * (itemsPerRow - 1)) / itemsPerRow);
        
        // Update dynamic CSS variables
        this.updateDynamicGridVariables(cardWidth, itemsPerRow);
        
        const itemHeight = cardHeightPx + gapPx;
        
        // Calculate visible range (with buffer)
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        
        const startRow = Math.max(0, Math.floor(scrollTop / itemHeight) - this.config.grid.bufferRows);
        const endRow = Math.ceil((scrollTop + containerHeight) / itemHeight) + this.config.grid.bufferRows;
        const startIndex = startRow * itemsPerRow;
        const endIndex = Math.min(this.filteredDatasets.length, endRow * itemsPerRow);
        
        // Set grid total height (maintain scrollbar)
        const totalRows = Math.ceil(this.filteredDatasets.length / itemsPerRow);
        grid.style.height = `${totalRows * itemHeight}px`;
        
        // Get visible datasets
        const visibleDatasets = this.filteredDatasets.slice(startIndex, endIndex);
        const visiblePaths = new Set(visibleDatasets.map(ds => ds.path));
        
        // Remove invisible cards
        const existingCards = grid.querySelectorAll('.video-card');
        existingCards.forEach(card => {
            const path = card.dataset.path;
            if (!visiblePaths.has(path)) {
                // 取消观察（观察的是 card，不是 video）
                if (this.videoAutoPlayObserver && card.dataset.videoObserved) {
                    this.videoAutoPlayObserver.unobserve(card);
                }
                // 停止视频播放并清理资源
                const video = card.querySelector('video');
                if (video) {
                    video.pause();
                    video.src = '';
                    video.srcObject = null;
                }
                card.remove();
                this._videoCardIndex.delete(path);
            } else {
                this._videoCardIndex.set(path, card);
            }
        });
        
        // Add/update visible cards
        const fragment = document.createDocumentFragment();
        visibleDatasets.forEach((ds, i) => {
            const globalIndex = startIndex + i;
            const row = Math.floor(globalIndex / itemsPerRow);
            const col = globalIndex % itemsPerRow;
            
            let card = this._videoCardIndex.get(ds.path);
            const isNewCard = !card;
            
            if (isNewCard) {
                card = this.createVideoCard(ds);
            }
            
            // Set absolute positioning and size
            card.style.position = 'absolute';
            card.style.left = `${col * (cardWidth + gapPx)}px`;
            card.style.top = `${row * itemHeight}px`;
            card.style.width = 'var(--grid-card-width)';
            card.style.height = 'var(--grid-card-height)';
            
            // Update card state
            this.updateCardState(card, ds);
            
            if (isNewCard) {
                this._videoCardIndex.set(ds.path, card);
                fragment.appendChild(card);
            }
        });
        
        // Batch add new cards
        if (fragment.hasChildNodes()) {
            grid.appendChild(fragment);
        }
        
        // Observe videos for auto-play
        this.observeVideos();
    }
    
    /**
     * Create single video card
     * @param {Dataset} ds - Dataset object
     * @returns {HTMLElement} Video card element
     */
    createVideoCard(ds) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.path = ds.path;
        if (this.selectedDatasets.has(ds.path)) card.classList.add('selected');
        
        card.innerHTML = Templates.buildVideoCard(
            ds, 
            this.formatMetaTags.bind(this), 
            this.formatHoverOverlay.bind(this), 
            this.listDatasets
        );
        
        return card;
    }
    
    /**
     * Update single card state
     * @param {HTMLElement} card - Card element
     * @param {Dataset} ds - Dataset object
     */
    updateCardState(card, ds) {
        const shouldBeSelected = this.selectedDatasets.has(ds.path);
        const isSelected = card.classList.contains('selected');
        
        if (shouldBeSelected !== isSelected) {
            card.classList.toggle('selected', shouldBeSelected);
        }
        
        const shouldHaveBadge = this.listDatasets.has(ds.path);
        const badge = card.querySelector('.video-success-badge');
        
        if (shouldHaveBadge && !badge) {
            card.querySelector('.video-thumbnail').insertAdjacentHTML(
                'beforeend', 
                Templates.buildVideoSuccessBadge()
            );
        } else if (!shouldHaveBadge && badge) {
            badge.remove();
        }
    }
    
    /**
     * Update all card styles (batched)
     */
    updateCardStyles() {
        if (this.updateStylesScheduled) return;
        
        this.updateStylesScheduled = true;
        requestAnimationFrame(() => {
            const cards = document.querySelectorAll('.video-card');
            
            const updates = [];
            cards.forEach(card => {
                const path = card.dataset.path;
                if (!path) return;
                
                const shouldBeSelected = this.selectedDatasets.has(path);
                const shouldHaveBadge = this.listDatasets.has(path);
                
                updates.push({ card, path, shouldBeSelected, shouldHaveBadge });
            });
            
            updates.forEach(({ card, path, shouldBeSelected, shouldHaveBadge }) => {
                card.classList.toggle('selected', shouldBeSelected);
                
                const badge = card.querySelector('.video-success-badge');
                const thumbnail = card.querySelector('.video-thumbnail');
                
                if (shouldHaveBadge && !badge) {
                    thumbnail.insertAdjacentHTML('beforeend', Templates.buildVideoSuccessBadge());
                } else if (!shouldHaveBadge && badge) {
                    badge.remove();
                }
            });
            
            this.updateStylesScheduled = false;
        });
    }
    
    /**
     * Observe videos for auto-play
     */
    observeVideos() {
        if (!this.videoAutoPlayObserver) {
            this.videoAutoPlayObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const card = entry.target;
                    const thumbnail = card.querySelector('.video-thumbnail');
                    
                    if (!thumbnail) return;
                    
                    if (entry.isIntersecting) {
                        if (!thumbnail.dataset.videoLoading && !thumbnail.dataset.videoLoaded) {
                            thumbnail.dataset.videoLoading = 'true';
                            this.loadAndPlayVideo(thumbnail);
                        }
                    } else {
                        const video = thumbnail.querySelector('video');
                        if (video) {
                            video.pause();
                        }
                    }
                });
            }, { 
                rootMargin: '200px',
                threshold: 0.01
            });
        }
        
        document.querySelectorAll('.video-card').forEach(card => {
            if (!card.dataset.videoObserved) {
                this.videoAutoPlayObserver.observe(card);
                card.dataset.videoObserved = 'true';
            }
        });
    }
    
    /**
     * Load and play video
     * @param {HTMLElement} thumbnail - Thumbnail element
     */
    loadAndPlayVideo(thumbnail) {
        const videoUrl = thumbnail.dataset.videoUrl;
        if (!videoUrl) return;
        
        // 检查元素是否还在 DOM 中
        if (!thumbnail.isConnected) {
            delete thumbnail.dataset.videoLoading;
            return;
        }
        
        let video = thumbnail.querySelector('video');
        
        if (!video) {
            video = document.createElement('video');
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.className = 'lazy-video';
            video.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; z-index: 2; transition: opacity 0.3s ease;';
            
            const source = document.createElement('source');
            source.src = videoUrl;
            source.type = 'video/mp4';
            
            video.appendChild(source);
            thumbnail.insertBefore(video, thumbnail.firstChild);
            
            video.addEventListener('loadeddata', () => {
                // 检查元素是否还在 DOM 中
                if (!thumbnail.isConnected || !video.isConnected) {
                    delete thumbnail.dataset.videoLoading;
                    return;
                }
                
                const img = thumbnail.querySelector('.thumbnail-image');
                video.style.opacity = '1';
                if (img) img.style.opacity = '0';
                
                video.play().catch(() => {});
                
                thumbnail.dataset.videoLoaded = 'true';
                delete thumbnail.dataset.videoLoading;
            }, { once: true });
            
            video.addEventListener('error', (e) => {
                console.error(`Video load error: ${videoUrl}`, e);
                delete thumbnail.dataset.videoLoading;
            }, { once: true });
            
            video.load();
        } else {
            // 检查元素是否还在 DOM 中
            if (!thumbnail.isConnected || !video.isConnected) {
                return;
            }
            
            if (video.paused) {
                video.style.opacity = '1';
                const img = thumbnail.querySelector('.thumbnail-image');
                if (img) img.style.opacity = '0';
                
                video.play().catch(() => {});
            }
        }
    }
    
    /**
     * Format meta tags for video card
     * @param {Dataset} ds - Dataset
     * @returns {string} HTML string
     */
    formatMetaTags(ds) {
        const tags = [];
        
        if (ds.scenes && ds.scenes.length > 0) {
            const more = ds.scenes.length > 1 ? `+${ds.scenes.length - 1}` : '';
            tags.push(Templates.buildVideoTag(ds.scenes[0], more));
        }
        
        if (ds.robot) {
            const robots = Array.isArray(ds.robot) ? ds.robot : [ds.robot];
            const more = robots.length > 1 ? `+${robots.length - 1}` : '';
            tags.push(Templates.buildVideoTag(robots[0], more));
        }
        
        if (ds.endEffector) {
            tags.push(Templates.buildVideoTag(ds.endEffector));
        }
        
        return tags.join('');
    }
    
    /**
     * Format hover overlay
     * @param {Dataset} ds - Dataset
     * @returns {string} HTML string
     */
    formatHoverOverlay(ds) {
        return Templates.buildHoverOverlay(ds);
    }
}

export default VideoGridManager;

