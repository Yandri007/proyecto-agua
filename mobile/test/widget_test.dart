import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import 'package:aquacontrol/main.dart';

void main() {
  testWidgets('App smoke test - monta la aplicacion correctamente',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: AquaControlApp(),
      ),
    );

    final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(materialApp.routerConfig, isNotNull);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
