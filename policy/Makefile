.PHONY: all build test test clean

all: build

build:
	mkdir -p bundles
	opa build -o bundles/bundle.tar.gz policies

test: .
	opa test -v policies

clean:
	rm -rf bundles/*
