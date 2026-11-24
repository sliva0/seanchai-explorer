import { Component } from 'preact';
import type { ComponentChildren } from 'preact';
import { describeFailure, reportError } from './errors.ts';
import type { Failure, FailureContext } from './errors.ts';
import { failure as words } from './text/site.ts';

/**
 * A page's failure: what failed in plain words and what to do where there is something, the way back to the index
 * and a reload, and the error's message and stack folded under them.
 */
export function FailurePanel({
  failure,
  indexHref,
  inline = false,
}: {
  failure: Failure;
  indexHref: string;
  /** In a part of a page that is otherwise shown, as search's results: its heading is no page's. */
  inline?: boolean;
}) {
  return (
    <div class={inline ? 'failure failure-inline' : 'failure'} role={inline ? 'alert' : undefined}>
      {inline ? (
        <p class="failure-heading">
          <strong>{failure.heading}</strong>
        </p>
      ) : (
        <h1 tabIndex={-1}>{failure.heading}</h1>
      )}
      <p class="failure-summary">{failure.summary}</p>
      {failure.hint && <p class="failure-hint">{failure.hint}</p>}
      <p class="failure-message">
        {words.error} <code>{failure.message}</code>
      </p>
      <p class="failure-actions">
        <a class="control" href={indexHref}>
          {words.toIndex}
        </a>
        <button type="button" class="control" onClick={() => location.reload()}>
          {words.reload}
        </button>
      </p>
      <details class="failure-details">
        <summary>{words.details}</summary>
        <pre>{failure.stack}</pre>
      </details>
    </div>
  );
}

interface BoundaryProps {
  children: ComponentChildren;
  /** The page drawn: a failure is shown until another is. */
  page: object;
  /** What the page's words say of where it failed. */
  context: FailureContext;
  indexHref: string;
  /** Told of the error once it is caught, for the router to know the page it drew is not there. */
  onError?(error: unknown): void;
}

interface Caught {
  thrown: unknown;
  /** The page it failed on: the next page drawn is drawn afresh. */
  page: object;
}

/**
 * Holds a failure while a page is drawn, in its components or their effects: it shows the failure in the page's place
 * and logs it, where without it the tree would be left half drawn, an empty page that says nothing. The next page the
 * router draws is drawn again, and a page drawn anew of the same one, as another tab of the index, keeps its components.
 * The first failure of a page is the one it shows; a later one, of a part drawn beside it, is only logged.
 */
export class FailureBoundary extends Component<BoundaryProps, { caught?: Caught }> {
  /** Set as the failure is caught, before the state it is drawn from: a second failure in one draw sees it. */
  private caught?: Caught;

  componentDidCatch(thrown: unknown) {
    reportError(thrown);
    if (this.caught?.page === this.props.page) return;
    this.caught = { thrown, page: this.props.page };
    this.setState({ caught: this.caught });
    this.props.onError?.(thrown);
  }

  render() {
    const { caught } = this.state;
    if (!caught || caught.page !== this.props.page) return this.props.children;
    return (
      <FailurePanel failure={describeFailure(caught.thrown, this.props.context)} indexHref={this.props.indexHref} />
    );
  }
}
