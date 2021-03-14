import {
    ThumbnailsSettings,
    thumbnailsSettings,
} from './lg-thumbnail-settings';
import { lgQuery } from '../../lgQuery';
import { LightGallery } from '../../lightgallery';
import { GalleryItem } from '../../lg-utils';
import { lGEvents } from '../../lg-events';
interface ThumbDragUtils {
    cords: {
        startX: number;
        endX: number;
    };
    isMoved: boolean;
    newTranslateX: number;
    startTime: Date;
    endTime: Date;
    touchMoveTime: number;
}
declare global {
    interface Window {
        $LG: (selector: any) => lgQuery;
    }
}

const $LG = window.$LG;

interface ThumbnailGalleryItem extends GalleryItem {
    thumb: string;
}
export class Thumbnail {
    private core: LightGallery;
    private $thumbOuter!: lgQuery;
    private $lgThumb!: lgQuery;
    private thumbOuterWidth = 0;
    private thumbTotalWidth = 0;
    private translateX = 0;
    private thumbClickable = false;
    private settings: ThumbnailsSettings;
    constructor(instance: LightGallery) {
        // get lightGallery core plugin data
        this.core = instance;
        // extend module default settings with lightGallery core settings
        this.settings = Object.assign(
            {},
            thumbnailsSettings,
            this.core.settings,
        );

        this.init();

        return this;
    }

    init(): void {
        this.thumbOuterWidth = 0;
        this.thumbTotalWidth =
            this.core.galleryItems.length *
            (this.settings.thumbWidth + this.settings.thumbMargin);

        // Thumbnail animation value
        this.translateX = 0;

        this.setAnimateThumbStyles();

        if (!this.core.settings.allowMediaOverlap) {
            this.settings.toggleThumb = false;
        }
        if (
            !this.settings.animateThumb ||
            this.core.settings.appendSubHtmlTo !== '.lg-sub-html'
        ) {
            this.settings.pullCaptionUp = false;
        }

        if (this.settings.thumbnail && this.core.galleryItems.length > 1) {
            if (this.settings.pullCaptionUp) {
                this.core.outer.addClass('lg-pull-caption-up');
            }

            this.build();
            if (this.settings.animateThumb) {
                if (this.settings.enableThumbDrag) {
                    this.enableThumbDrag();
                }

                if (this.settings.enableThumbSwipe) {
                    this.enableThumbSwipe();
                }

                this.thumbClickable = false;
            } else {
                this.thumbClickable = true;
            }

            this.toggleThumbBar();
            this.thumbKeyPress();
        }
    }

    build(): void {
        this.setThumbMarkup();
        this.manageActiveClassOnSlideChange();
        this.$lgThumb.first().on('click.lg touchend.lg', (e: CustomEvent) => {
            const $target = $LG(e.target);
            if (!$target.hasAttribute('data-lg-item-id')) {
                return;
            }
            setTimeout(() => {
                // In IE9 and bellow touch does not support
                // Go to slide if browser does not support css transitions
                if (this.thumbClickable && !this.core.lgBusy) {
                    const index = parseInt($target.attr('data-lg-item-id'));
                    this.core.slide(index, false, true, false);
                }
            }, 50);
        });

        this.core.LGel.on(`${lGEvents.beforeSlide}.thumb`, (event) => {
            const { index } = event.detail;
            this.animateThumb(index);
        });
        this.core.LGel.on(`${lGEvents.beforeOpen}.thumb`, () => {
            if (this.settings.showThumbByDefault) {
                const timeout = this.core.settings.zoomFromOrigin
                    ? 100
                    : this.core.settings.backdropDuration;
                setTimeout(() => {
                    this.core.outer.addClass('lg-thumb-open');
                }, timeout);
            }
        });
        this.core.LGel.on(`${lGEvents.beforeClose}.thumb`, () => {
            this.core.outer.removeClass('lg-thumb-open');
        });

        this.core.LGel.on(`${lGEvents.updateSlides}.thumb`, () => {
            this.rebuildThumbnails();
        });
        this.core.LGel.on(`${lGEvents.containerResize}.thumb`, () => {
            if (!this.core.lgOpened) return;
            setTimeout(() => {
                this.animateThumb(this.core.index);
                this.thumbOuterWidth = window.innerWidth;
            }, 200);
        });
    }

    setThumbMarkup(): void {
        const html = `<div class="lg-thumb-outer">
        <div class="lg-thumb lg-group">
        </div>
        </div>`;

        this.core.outer.addClass('lg-has-thumb');

        this.core.$lgContent.append(html);

        this.$thumbOuter = this.core.outer.find('.lg-thumb-outer').first();
        this.$lgThumb = this.core.outer.find('.lg-thumb').first();
        this.thumbOuterWidth = window.innerWidth;

        if (this.settings.animateThumb) {
            this.core.outer
                .find('.lg-thumb')
                .css('transition-duration', this.core.settings.speed + 'ms')
                .css('width', this.thumbTotalWidth + 'px')
                .css('position', 'relative');
        }

        this.setThumbItemHtml(
            (this.core.galleryItems as unknown) as ThumbnailGalleryItem[],
        );
    }

    enableThumbDrag(): void {
        let thumbDragUtils: ThumbDragUtils = {
            cords: {
                startX: 0,
                endX: 0,
            },
            isMoved: false,
            newTranslateX: 0,
            startTime: new Date(),
            endTime: new Date(),
            touchMoveTime: 0,
        };

        let isDragging = false;

        this.$thumbOuter.addClass('lg-grab');

        this.core.outer
            .find('.lg-thumb')
            .first()
            .on('mousedown.lg.thumb', (e) => {
                if (this.thumbTotalWidth > this.thumbOuterWidth) {
                    // execute only on .lg-object
                    e.preventDefault();
                    thumbDragUtils.cords.startX = e.pageX;

                    thumbDragUtils.startTime = new Date();
                    this.thumbClickable = false;

                    isDragging = true;

                    // ** Fix for webkit cursor issue https://code.google.com/p/chromium/issues/detail?id=26723
                    this.core.outer.get().scrollLeft += 1;
                    this.core.outer.get().scrollLeft -= 1;

                    // *
                    this.$thumbOuter
                        .removeClass('lg-grab')
                        .addClass('lg-grabbing');
                }
            });

        $LG(window).on(`mousemove.lg.thumb.global${this.core.lgId}`, (e) => {
            if (!this.core.lgOpened) return;
            if (isDragging) {
                thumbDragUtils.cords.endX = e.pageX;

                thumbDragUtils = this.onThumbTouchMove(thumbDragUtils);
            }
        });

        $LG(window).on(`mouseup.lg.thumb.global${this.core.lgId}`, () => {
            if (!this.core.lgOpened) return;
            if (thumbDragUtils.isMoved) {
                thumbDragUtils = this.onThumbTouchEnd(thumbDragUtils);
            } else {
                this.thumbClickable = true;
            }

            if (isDragging) {
                isDragging = false;
                this.$thumbOuter.removeClass('lg-grabbing').addClass('lg-grab');
            }
        });
    }

    enableThumbSwipe(): void {
        let thumbDragUtils: ThumbDragUtils = {
            cords: {
                startX: 0,
                endX: 0,
            },
            isMoved: false,
            newTranslateX: 0,
            startTime: new Date(),
            endTime: new Date(),
            touchMoveTime: 0,
        };

        this.$lgThumb.on('touchstart.lg', (e: TouchEvent) => {
            if (this.thumbTotalWidth > this.thumbOuterWidth) {
                e.preventDefault();
                thumbDragUtils.cords.startX = e.targetTouches[0].pageX;
                this.thumbClickable = false;
                thumbDragUtils.startTime = new Date();
            }
        });

        this.$lgThumb.on('touchmove.lg', (e: TouchEvent) => {
            if (this.thumbTotalWidth > this.thumbOuterWidth) {
                e.preventDefault();
                thumbDragUtils.cords.endX = e.targetTouches[0].pageX;
                thumbDragUtils = this.onThumbTouchMove(thumbDragUtils);
            }
        });

        this.$lgThumb.on('touchend.lg', () => {
            if (thumbDragUtils.isMoved) {
                thumbDragUtils = this.onThumbTouchEnd(thumbDragUtils);
            } else {
                this.thumbClickable = true;
            }
        });
    }

    // Rebuild thumbnails
    rebuildThumbnails(): void {
        // Remove transitions
        this.$thumbOuter.addClass('lg-rebuilding-thumbnails');
        setTimeout(() => {
            this.thumbTotalWidth =
                this.core.galleryItems.length *
                (this.settings.thumbWidth + this.settings.thumbMargin);
            this.$lgThumb.css('width', this.thumbTotalWidth + 'px');
            this.$lgThumb.empty();
            this.setThumbItemHtml(
                (this.core.galleryItems as unknown) as ThumbnailGalleryItem[],
            );
            this.animateThumb(this.core.index);
        }, 50);
        setTimeout(() => {
            this.$thumbOuter.removeClass('lg-rebuilding-thumbnails');
        }, 200);
    }

    // @ts-check

    setTranslate(value: number): void {
        this.$lgThumb.css(
            'transform',
            'translate3d(-' + value + 'px, 0px, 0px)',
        );
    }

    getPossibleTransformX(left: number): number {
        if (left > this.thumbTotalWidth - this.thumbOuterWidth) {
            left = this.thumbTotalWidth - this.thumbOuterWidth;
        }

        if (left < 0) {
            left = 0;
        }
        return left;
    }

    animateThumb(index: number): void {
        this.$lgThumb.css(
            'transition-duration',
            this.core.settings.speed + 'ms',
        );
        if (this.settings.animateThumb) {
            let position = 0;
            switch (this.settings.currentPagerPosition) {
                case 'left':
                    position = 0;
                    break;
                case 'middle':
                    position =
                        this.thumbOuterWidth / 2 - this.settings.thumbWidth / 2;
                    break;
                case 'right':
                    position = this.thumbOuterWidth - this.settings.thumbWidth;
            }
            this.translateX =
                (this.settings.thumbWidth + this.settings.thumbMargin) * index -
                1 -
                position;
            if (this.translateX > this.thumbTotalWidth - this.thumbOuterWidth) {
                this.translateX = this.thumbTotalWidth - this.thumbOuterWidth;
            }

            if (this.translateX < 0) {
                this.translateX = 0;
            }

            this.setTranslate(this.translateX);
        }
    }

    onThumbTouchMove(thumbDragUtils: ThumbDragUtils): ThumbDragUtils {
        thumbDragUtils.newTranslateX = this.translateX;
        thumbDragUtils.isMoved = true;

        thumbDragUtils.touchMoveTime = new Date().valueOf();

        thumbDragUtils.newTranslateX -=
            thumbDragUtils.cords.endX - thumbDragUtils.cords.startX;

        thumbDragUtils.newTranslateX = this.getPossibleTransformX(
            thumbDragUtils.newTranslateX,
        );

        // move current slide
        this.setTranslate(thumbDragUtils.newTranslateX);
        this.$thumbOuter.addClass('lg-dragging');

        return thumbDragUtils;
    }

    onThumbTouchEnd(thumbDragUtils: ThumbDragUtils): ThumbDragUtils {
        thumbDragUtils.isMoved = false;
        thumbDragUtils.endTime = new Date();
        this.$thumbOuter.removeClass('lg-dragging');

        const touchDuration =
            thumbDragUtils.endTime.valueOf() -
            thumbDragUtils.startTime.valueOf();
        let distanceXnew =
            thumbDragUtils.cords.endX - thumbDragUtils.cords.startX;
        let speedX = Math.abs(distanceXnew) / touchDuration;
        // Some magical numbers
        // Can be improved
        if (
            speedX > 0.15 &&
            thumbDragUtils.endTime.valueOf() - thumbDragUtils.touchMoveTime < 30
        ) {
            speedX += 1;

            if (speedX > 2) {
                speedX += 1;
            }
            speedX =
                speedX +
                speedX * (Math.abs(distanceXnew) / this.thumbOuterWidth);
            this.$lgThumb.css(
                'transition-duration',
                Math.min(speedX - 1, 2) + 'settings',
            );

            distanceXnew = distanceXnew * speedX;

            this.translateX = this.getPossibleTransformX(
                this.translateX - distanceXnew,
            );
            this.setTranslate(this.translateX);
        } else {
            this.translateX = thumbDragUtils.newTranslateX;
        }
        if (
            Math.abs(thumbDragUtils.cords.endX - thumbDragUtils.cords.startX) <
            this.settings.swipeThreshold
        ) {
            this.thumbClickable = true;
        }

        return thumbDragUtils;
    }

    getThumbHtml(thumb: string, index: number): string {
        const slideVideoInfo =
            this.core.galleryItems[index].__slideVideoInfo || {};
        let thumbImg;

        if (slideVideoInfo.youtube) {
            if (this.settings.loadYouTubeThumbnail) {
                thumbImg =
                    '//img.youtube.com/vi/' +
                    slideVideoInfo.youtube[1] +
                    '/' +
                    this.settings.youTubeThumbSize +
                    '.jpg';
            } else {
                thumbImg = thumb;
            }
        } else {
            thumbImg = thumb;
        }

        return `<div data-lg-item-id="${index}" class="lg-thumb-item ${
            index === this.core.index ? ' active' : ''
        }" 
        style="width:${this.settings.thumbWidth}px; height: ${
            this.settings.thumbHeight
        };
            margin-right: ${this.settings.thumbMargin}px">
            <img data-lg-item-id="${index}" src="${thumbImg}" />
        </div>`;
    }

    getThumbItemHtml(items: ThumbnailGalleryItem[]): string {
        let thumbList = '';
        for (let i = 0; i < items.length; i++) {
            thumbList += this.getThumbHtml(items[i].thumb, i);
        }

        return thumbList;
    }

    setThumbItemHtml(items: ThumbnailGalleryItem[]): void {
        const thumbList = this.getThumbItemHtml(items);
        this.$lgThumb.html(thumbList);
    }

    setAnimateThumbStyles(): void {
        if (this.settings.animateThumb) {
            this.core.outer.addClass('lg-animate-thumb');
        }
    }

    // Manage thumbnail active calss
    manageActiveClassOnSlideChange(): void {
        // manage active class for thumbnail
        this.core.LGel.on(
            `${lGEvents.beforeSlide}.thumb`,
            (event: CustomEvent) => {
                const $thumb = this.core.outer.find('.lg-thumb-item');
                const { index } = event.detail;
                $thumb.removeClass('active');
                $thumb.eq(index).addClass('active');
            },
        );
    }

    // Toggle thumbnail bar
    toggleThumbBar(): void {
        if (this.settings.toggleThumb) {
            this.core.outer.addClass('lg-can-toggle');
            this.$thumbOuter.append(
                '<button type="button" aria-label="Toggle thumbnails" class="lg-toggle-thumb lg-icon"></button>',
            );
            this.core.outer
                .find('.lg-toggle-thumb')
                .first()
                .on('click.lg', () => {
                    this.core.outer.toggleClass('lg-thumb-open');
                });
        }
    }

    thumbKeyPress(): void {
        $LG(window).on(`keydown.lg.thumb.global${this.core.lgId}`, (e) => {
            if (!this.core.lgOpened || !this.settings.toggleThumb) return;

            if (e.keyCode === 38) {
                e.preventDefault();
                this.core.outer.addClass('lg-thumb-open');
            } else if (e.keyCode === 40) {
                e.preventDefault();
                this.core.outer.removeClass('lg-thumb-open');
            }
        });
    }

    destroy(): void {
        if (this.settings.thumbnail && this.core.galleryItems.length > 1) {
            $LG(window).off(`.lg.thumb.global${this.core.lgId}`);
            this.core.LGel.off('.lg.thumb');
            this.$thumbOuter.remove();
            this.core.outer.removeClass('lg-has-thumb');
        }
    }
}
window.lgModules = window.lgModules || {};
window.lgModules.thumbnail = Thumbnail;