# Jekyll build image for scripts/build-theme. Matches CI's Ruby 3.1 and the
# template Gemfile (github-pages), so local builds run the same safe-mode
# plugin set as GitHub Pages.
FROM ruby:3.1-slim-bookworm@sha256:2704d8eede6d399b07e5475cae41f7e7077edd9e970753f543ddb445f7f0424f

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential git libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /gems
COPY Gemfile /gems/Gemfile
ENV BUNDLE_GEMFILE=/gems/Gemfile \
    BUNDLE_SILENCE_ROOT_WARNING=1 \
    HOME=/tmp
RUN bundle install --jobs 4 && chmod -R a+rX /usr/local/bundle /gems
