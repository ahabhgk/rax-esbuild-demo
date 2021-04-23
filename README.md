# rax-esbuild-demo

```shell
time yarn build:jsx2mp  # 5.88s user 0.44s system 155% cpu 4.065 total
time yarn build:es      # 1.33s user 0.17s system 99% cpu 1.501 total
time yarn build:raw     # 0.68s user 0.10s system 54% cpu 1.453 total
```

This is just a demo to verify an idea, the original build tool `jsx2mp` uses webpack, but most of the functions can be realized only by loader, so I wrote a version (`es`) using esbuild, and wrote a version (`raw`) without using any tools, to compare the build speed.

Of course, both `raw` and `es` are missing some functions, they can only be used for simple construction, but their speed overhead lies in I/O, jsx2mp's speed overhead lies in I/O and webpack.
