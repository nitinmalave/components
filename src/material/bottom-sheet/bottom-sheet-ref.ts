/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {ESCAPE, hasModifierKey} from '@angular/cdk/keycodes';
import {OverlayRef} from '@angular/cdk/overlay';
import {merge, Observable, Subject} from 'rxjs';
import {filter, take} from 'rxjs/operators';
import {MatBottomSheetContainer} from './bottom-sheet-container';

/**
 * Reference to a bottom sheet dispatched from the bottom sheet service.
 */
export class MatBottomSheetRef<T = any, R = any> {
  /** Instance of the component making up the content of the bottom sheet. */
  instance: T;

  /**
   * Instance of the component into which the bottom sheet content is projected.
   * @docs-private
   */
  containerInstance: MatBottomSheetContainer;

  /** Whether the user is allowed to close the bottom sheet. */
  disableClose: boolean | undefined;

  /** Subject for notifying the user that the bottom sheet has been dismissed. */
  private readonly _afterDismissed = new Subject<R | undefined>();

  /** Subject for notifying the user that the bottom sheet has opened and appeared. */
  private readonly _afterOpened = new Subject<void>();

  /** Result to be passed down to the `afterDismissed` stream. */
  private _result: R | undefined;

  /** Handle to the timeout that's running as a fallback in case the exit animation doesn't fire. */
  private _closeFallbackTimeout: any;

  constructor(containerInstance: MatBottomSheetContainer, private _overlayRef: OverlayRef) {
    this.containerInstance = containerInstance;
    this.disableClose = containerInstance.bottomSheetConfig.disableClose;

    // Emit when opening animation completes
    containerInstance._animationStateChanged
      .pipe(
        filter(event => event.phaseName === 'done' && event.toState === 'visible'),
        take(1),
      )
      .subscribe(() => {
        this._afterOpened.next();
        this._afterOpened.complete();
      });

    // Dispose overlay when closing animation is complete
    containerInstance._animationStateChanged
      .pipe(
        filter(event => event.phaseName === 'done' && event.toState === 'hidden'),
        take(1),
      )
      .subscribe(() => {
        clearTimeout(this._closeFallbackTimeout);
        _overlayRef.dispose();
      });

    _overlayRef
      .detachments()
      .pipe(take(1))
      .subscribe(() => {
        this._afterDismissed.next(this._result);
        this._afterDismissed.complete();
      });

    merge(
      _overlayRef.backdropClick(),
      _overlayRef.keydownEvents().pipe(filter(event => event.keyCode === ESCAPE)),
    ).subscribe(event => {
      if (
        !this.disableClose &&
        (event.type !== 'keydown' || !hasModifierKey(event as KeyboardEvent))
      ) {
        event.preventDefault();
        this.dismiss();
      }
    });
  }

  /**
   * Dismisses the bottom sheet.
   * @param result Data to be passed back to the bottom sheet opener.
   */
  dismiss(result?: R): void {
    if (!this._afterDismissed.closed) {
      // Transition the backdrop in parallel to the bottom sheet.
      this.containerInstance._animationStateChanged
        .pipe(
          filter(event => event.phaseName === 'start'),
          take(1),
        )
        .subscribe(event => {
          // The logic that disposes of the overlay depends on the exit animation completing, however
          // it isn't guaranteed if the parent view is destroyed while it's running. Add a fallback
          // timeout which will clean everything up if the animation hasn't fired within the specified
          // amount of time plus 100ms. We don't need to run this outside the NgZone, because for the
          // vast majority of cases the timeout will have been cleared before it has fired.
          this._closeFallbackTimeout = setTimeout(() => {
            this._overlayRef.dispose();
          }, event.totalTime + 100);

          this._overlayRef.detachBackdrop();
        });

      this._result = result;
      this.containerInstance.exit();
    }
  }

  /** Gets an observable that is notified when the bottom sheet is finished closing. */
  afterDismissed(): Observable<R | undefined> {
    return this._afterDismissed;
  }

  /** Gets an observable that is notified when the bottom sheet has opened and appeared. */
  afterOpened(): Observable<void> {
    return this._afterOpened;
  }

  /**
   * Gets an observable that emits when the overlay's backdrop has been clicked.
   */
  backdropClick(): Observable<MouseEvent> {
    return this._overlayRef.backdropClick();
  }

  /**
   * Gets an observable that emits when keydown events are targeted on the overlay.
   */
  keydownEvents(): Observable<KeyboardEvent> {
    return this._overlayRef.keydownEvents();
  }
}
